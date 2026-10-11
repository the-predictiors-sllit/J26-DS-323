"""Independent solar routes accept a binary mask: predicted or human reviewed."""

import io
import json
import threading
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import numpy as np
import pandas as pd
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError
from .schema import SolarSettings
from .engine import analyze, preview

router = APIRouter(prefix="/solar", tags=["Solar orientation"])
calculation_lock = threading.Lock()


@router.post("/analyze")
def analyze_orientation(
    settings: str = Form(...),
    mask: UploadFile = File(...),
    weather: UploadFile | None = File(None),
    preview_only: bool = Form(False),
):
    try:
        config = SolarSettings.model_validate_json(settings)
    except ValidationError as exc:
        raise HTTPException(
            422, "; ".join(error["msg"] for error in exc.errors())
        ) from exc
    data = mask.file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Mask must be no larger than 5 MB.")
    try:
        with Image.open(io.BytesIO(data)) as raw:
            if raw.format != "PNG" or raw.width * raw.height > 16_000_000:
                raise ValueError("Use a binary PNG mask up to 16 megapixels.")
            rgba = np.asarray(raw.convert("RGBA"))
            if not (rgba[:, :, 3] == 255).all():
                raise ValueError(
                    "Mask must be opaque, with no transparent/unknown pixels."
                )
            if not (
                np.array_equal(rgba[:, :, 0], rgba[:, :, 1])
                and np.array_equal(rgba[:, :, 0], rgba[:, :, 2])
            ):
                raise ValueError(
                    "Upload a black/white mask, not the original photo or a coloured overlay."
                )
            binary = rgba[:, :, 0].copy()
    except (
        ValueError,
        OSError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
    ) as exc:
        raise HTTPException(422, str(exc)) from exc
    weather_bytes = None if weather is None else weather.file.read(10 * 1024 * 1024 + 1)
    if weather_bytes is not None and len(weather_bytes) > 10 * 1024 * 1024:
        raise HTTPException(413, "Weather CSV must be no larger than 10 MB.")
    if not calculation_lock.acquire(blocking=False):
        raise HTTPException(
            429,
            "Another solar calculation is running. Wait for it to finish before retrying.",
        )
    try:
        if preview_only:
            return preview(binary, config)
        report = analyze(binary, config, weather_bytes)
        report["mask_filename"] = mask.filename
        report["weather_filename"] = weather.filename if weather else None
        return report
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        calculation_lock.release()


@router.get("/weather-template")
def weather_template(
    year: int = Query(2026, ge=2000, le=2100),
    interval_minutes: int = Query(30),
    timezone: str = "Asia/Colombo",
):
    if interval_minutes not in (15, 30, 60):
        raise HTTPException(422, "Choose 15, 30 or 60 minutes.")
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise HTTPException(422, "Use a valid IANA timezone.") from exc
    times = pd.date_range(
        f"{year}-01-01",
        f"{year+1}-01-01",
        freq=f"{interval_minutes}min",
        tz=timezone,
        inclusive="left",
    )
    frame = pd.DataFrame(
        {"timestamp": [t.isoformat() for t in times], "ghi": "", "dni": "", "dhi": ""}
    )
    return Response(
        frame.to_csv(index=False),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="weather_template_{year}_{interval_minutes}min.csv"'
        },
    )
