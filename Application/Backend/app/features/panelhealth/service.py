"""service.py - the panel health logic behind router.py (no routes in here).

Model code lives in the ml/ folder, which is COPIED from experiments/lakhitha/PanelScan/src by
sync_to_backend.py. Do not edit ml/ by hand.
"""
import base64
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import cv2
import numpy as np
from fastapi import HTTPException

from .ml.corners import check_quad
from .ml.preprocessing import prepare_image

# Where the trained model is read from. Set PANELHEALTH_CHECKPOINT to use another file.
CHECKPOINT = Path(os.environ.get("PANELHEALTH_CHECKPOINT",
                                 Path(__file__).resolve().parent / "models" / "panelscan.pt"))
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

_predictor: Any = None


def model_available() -> bool:
    return CHECKPOINT.exists()


def get_predictor() -> Any:
    """Load the trained model once, the first time it is needed."""
    global _predictor
    if _predictor is None:
        if not CHECKPOINT.exists():
            raise HTTPException(503, f"No trained model found at {CHECKPOINT}. "
                                     "Run train_final.py and then sync_to_backend.py --with-model.")
        from .ml.inference import Predictor   # imported here so /crop works even if PyTorch is not installed
        try:
            _predictor = Predictor(str(CHECKPOINT))
        except RuntimeError as exc:           # for example: the Backend copy of preprocessing.py is out of date
            raise HTTPException(500, str(exc))
    return _predictor


def read_photo(data: bytes) -> np.ndarray:
    """Decode the uploaded JPEG/PNG into an RGB array (the phone's rotation is applied)."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That photo is too large.")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "That file is not a readable image.")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def parse_corners(text: str, img: np.ndarray) -> List[float]:
    """Corners arrive as JSON: 8 numbers between 0 and 1, top-left first, clockwise."""
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
