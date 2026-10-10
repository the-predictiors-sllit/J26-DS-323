"""Run locally: python -m uvicorn backend:app --host 127.0.0.1 --port 8000"""

import base64, io, os, threading
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
import torch
from model import load_model, predict, overlay

PROJECT_ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(
    os.environ.get("SOLAR_MODEL_PATH", "models/best_model.pt")
).expanduser()
if not MODEL_PATH.is_absolute():
    MODEL_PATH = PROJECT_ROOT / MODEL_PATH
state = {"model": None, "checkpoint": None, "error": None}
inference_lock = threading.Lock()
torch.set_num_threads(min(4, torch.get_num_threads()))


@asynccontextmanager
async def lifespan(app):
    if MODEL_PATH.exists():
        try:
            state["model"], state["checkpoint"] = load_model(MODEL_PATH, "cpu")
        except Exception as exc:
            state["error"] = str(exc)
    yield


app = FastAPI(title="SolarView segmentation API", lifespan=lifespan)
origins = os.environ.get(
    "SOLAR_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
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


@app.post("/segment")
def segment(photo: UploadFile = File(...)):
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
