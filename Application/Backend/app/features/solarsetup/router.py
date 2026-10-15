"""Feature router mounted by app.main at /api/v1/solarsetup."""

import base64, io, os, threading
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image, UnidentifiedImageError


PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(
    os.environ.get("SOLAR_MODEL_PATH", "models/best_model.pt")
).expanduser()
if not MODEL_PATH.is_absolute():
    MODEL_PATH = PROJECT_ROOT / MODEL_PATH
state = {"model": None, "checkpoint": None, "error": None}
inference_lock = threading.Lock()
router = APIRouter(tags=["solarsetup"])


def ensure_model():
    # Load once on first status/prediction request, not at shared app startup.
    # Missing/corrupt weights cannot prevent other group features from starting.
    with inference_lock:
        if state["model"] is not None or state["error"]:
            return
        if not MODEL_PATH.exists():
            return
        try:
            import torch
            from .model import load_model
            torch.set_num_threads(min(4, torch.get_num_threads()))
            state["model"], state["checkpoint"] = load_model(MODEL_PATH, "cpu")
        except Exception as exc:
            state["error"] = str(exc)


@router.get("/health")
def health():
    ensure_model()
    ck = state["checkpoint"]
    return {
        "status": (
            "ready"
            if state["model"] is not None
            else ("model_error" if state["error"] else "model_missing")
        ),
        "model_loaded": state["model"] is not None,
        "architecture": "DeepLabV3-ResNet50",
        "checkpoint_epoch": ck["epoch"] if ck else None,
        "input_size": ck["size"] if ck else None,
        "message": state["error"]
        or (
            None
            if ck
            else "Place your trained best_model.pt in models/ and restart the backend."
        ),
    }


def data_url(im, fmt):
    buf = io.BytesIO()
    im.save(buf, format=fmt)
    return (
        "data:image/"
        + ("jpeg" if fmt == "JPEG" else "png")
        + ";base64,"
        + base64.b64encode(buf.getvalue()).decode()
    )


@router.post("/segment")
def segment(photo: UploadFile = File(...)):
    ensure_model()
    if state["model"] is None:
        raise HTTPException(
            503,
            "No trained model loaded. Complete training, add best_model.pt to models/, and restart the backend.",
        )
    data = photo.file.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "Photo must be under 20 MB.")
    try:
        with Image.open(io.BytesIO(data)) as raw:
            if raw.format not in ["JPEG", "PNG"]:
                raise ValueError("Choose JPEG or PNG.")
            if raw.width * raw.height > 16_000_000:
                raise ValueError("Choose a photo up to 16 megapixels.")
            raw.load()
            image = raw.convert("RGB")
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as exc:
        raise HTTPException(400, str(exc)) from exc
    from .model import predict, overlay
    with inference_lock:
        mask, _ = predict(state["model"], image, state["checkpoint"]["size"], "cpu")
    preview = overlay(image, mask)
    preview.thumbnail((1200, 1200))
    return {
        "filename": Path(photo.filename or "photo").stem + "_predicted.png",
        "mask": data_url(mask, "PNG"),
        "overlay": data_url(preview, "JPEG"),
        "width": image.width,
        "height": image.height,
        "checkpoint_epoch": state["checkpoint"]["epoch"],
        "input_size": state["checkpoint"]["size"],
        "labels": {"0": "sky", "255": "obstacle"},
        "status": "prediction_requires_review",
        "note": "No rotation/crop performed. Camera projection and North alignment are not verified.",
    }


@router.get("")
def feature_info():
    return {"feature": "solarsetup", "status": "available"}

from .solar.api import router as solar_router
router.include_router(solar_router)
