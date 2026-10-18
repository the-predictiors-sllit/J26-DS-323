"""service.py - the panel health logic behind router.py (no routes in here).

Model code lives in the ml/ folder, which is COPIED from experiments/lakhitha/PanelScan/src by
sync_to_backend.py. Do not edit ml/ by hand.

The image libraries (cv2, numpy, pandas, torch...) are imported only when a panel health endpoint
that needs them is called. A missing package therefore answers that one endpoint with a clear message
instead of stopping the whole Backend (and every other member's feature) from starting.
"""
import base64
import json
import os
from importlib.util import find_spec
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List

from fastapi import HTTPException

from . import report as report_builder
from .schemas import ReportRequest

if TYPE_CHECKING:
    import numpy as np

# Where the trained model is read from. Set PANELHEALTH_CHECKPOINT to use another file.
CHECKPOINT = Path(os.environ.get("PANELHEALTH_CHECKPOINT",
                                 Path(__file__).resolve().parent / "models" / "panelscan.pt"))
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
REQUIRED_PACKAGES = ["cv2", "numpy", "pandas", "torch", "torchvision", "albumentations"]
INSTALL_HINT = ("The panel health packages are not installed. In Application/Backend/app run: "
                "uv add torch torchvision opencv-python-headless albumentations numpy pandas grad-cam")

_predictor: Any = None


def model_available() -> bool:
    return CHECKPOINT.exists()


def packages_installed() -> bool:
    return all(find_spec(name) is not None for name in REQUIRED_PACKAGES)


def _vision():
    """The image libraries and the shared helpers, imported on first use."""
    try:
        import cv2
        import numpy as np

        from .ml.corners import check_quad
        from .ml.preprocessing import prepare_image
    except ModuleNotFoundError as exc:
        raise HTTPException(503, f"{INSTALL_HINT} (missing: {exc.name})") from exc
    return cv2, np, check_quad, prepare_image


def get_predictor() -> Any:
    """Load the trained model once, the first time it is needed."""
    global _predictor
    if _predictor is None:
        if not CHECKPOINT.exists():
            raise HTTPException(503, f"No trained model found at {CHECKPOINT}. "
                                     "Run train_final.py and then sync_to_backend.py --with-model.")
        try:
            from .ml.inference import Predictor
        except ModuleNotFoundError as exc:
            raise HTTPException(503, f"{INSTALL_HINT} (missing: {exc.name})") from exc
        try:
            _predictor = Predictor(str(CHECKPOINT))
        except RuntimeError as exc:           # for example: the Backend copy of preprocessing.py is out of date
            raise HTTPException(500, str(exc))
    return _predictor


def read_photo(data: bytes) -> "np.ndarray":
    """Decode the uploaded JPEG/PNG into an RGB array (the phone's rotation is applied)."""
    cv2, np, _, _ = _vision()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That photo is too large.")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "That file is not a readable image.")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def parse_corners(text: str, img: "np.ndarray") -> List[float]:
    """Corners arrive as JSON: 8 numbers between 0 and 1, top-left first, clockwise."""
    check_quad = _vision()[2]
    try:
        vals = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(422, "corners must be a JSON list of 8 numbers.")
    ok = (isinstance(vals, list) and len(vals) == 8
          and all(isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 1 for v in vals))
    if not ok:
        raise HTTPException(422, "corners must be 8 numbers between 0 and 1.")
    problems = check_quad(vals, img.shape[1], img.shape[0])
    if problems:
        raise HTTPException(422, "The corners do not outline a panel: " + "; ".join(problems))
    return [float(v) for v in vals]


def crop_jpeg(photo_bytes: bytes, corners_text: str, size: int = 448) -> bytes:
    """The straightened panel as a JPEG, for the user to check before the analysis runs."""
    cv2, _, _, prepare_image = _vision()
    img = read_photo(photo_bytes)
    corners = parse_corners(corners_text, img)
    size = max(100, min(800, size))
    out = prepare_image(img, size=size, use_clahe=False, corners=corners)   # no CLAHE: shows the geometry clearly
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(out, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise HTTPException(500, "Could not encode the cropped panel.")
    return buf.tobytes()


def predict_report(photo_bytes: bytes, corners_text: str, rated_capacity_w: float,
                   age_years: float, explain: bool) -> Dict[str, Any]:
    """Health score, category, advice and watt range for one photo (plus a Grad-CAM heat map if asked)."""
    if not (0 < rated_capacity_w <= 1000):
        raise HTTPException(422, "rated_capacity_w must be between 0 and 1000 watts.")
    if not (0 <= age_years <= 40):
        raise HTTPException(422, "age_years must be between 0 and 40.")
    cv2 = _vision()[0]
    img = read_photo(photo_bytes)
    corners = parse_corners(corners_text, img)

    predictor = get_predictor()
    report: Dict[str, Any] = predictor.predict(img, corners, rated_capacity_w, age_years)

    if explain:
        try:
            overlay = predictor.explain(img, corners, rated_capacity_w, age_years)
            ok, buf = cv2.imencode(".png", cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
            report["heatmap_png_base64"] = base64.b64encode(buf.tobytes()).decode("ascii") if ok else None
        except Exception as exc:   # the heat map is a bonus: never lose the main answer because of it
            report["heatmap_png_base64"] = None
            report["heatmap_error"] = f"{type(exc).__name__}: {str(exc)[:150]}"
    return report


def make_report(req: ReportRequest) -> "tuple[bytes, str]":
    """The PDF report (bytes) and a file name for it. Nothing is written to disk or kept."""
    r = req.report
    if len(r.heatmap_png_base64 or "") > 4_000_000:
        raise HTTPException(413, "The heat map is too large.")
    try:
        crop = report_builder.decode_image(base64.b64decode(req.crop_jpeg_base64, validate=False)) if req.crop_jpeg_base64 else None
        heat = report_builder.decode_image(report_builder.heatmap_bytes(r.heatmap_png_base64))
        now = report_builder.datetime.now(report_builder.SL_TZ)
        report_id = report_builder.make_report_id(now)
        pdf = report_builder.build_pdf(
            health_score=r.health_score, tier=r.degradation_category, recommendation=r.recommendation,
            deposit=r.surface_deposit_detected, observation=r.surface_observation, output_range_w=r.output_range_w,
            output_range_pct=r.output_range_pct, rated_capacity_w=r.rated_capacity_w, note=r.note,
            age_years=req.age_years, photo_name=req.photo_name, crop_jpg=crop, heatmap_jpg=heat, now=now, report_id=report_id)
    except report_builder.ReportError as exc:
        raise HTTPException(422, str(exc))
    except report_builder.MissingPackage as exc:
        raise HTTPException(503, str(exc))
    except ValueError as exc:                       # a value the report cannot draw (for example a malformed base64 image)
        raise HTTPException(422, f"The report data could not be used: {exc}")
    return pdf, f"panel-health-report-{now:%Y%m%d-%H%M}.pdf"
