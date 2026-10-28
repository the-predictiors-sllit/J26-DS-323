"""Prepare conservative 15-minute solar slots for a 14-day schedule."""

from datetime import date, datetime, time, timedelta
from typing import Callable

import numpy as np
import pandas as pd

from .config import LOCAL_TZ
from .inference import load_prediction_model, predict_solar_power
from .weather import get_forecast_weather


def prepare_forecast_slots(
    *,
    latitude: float,
    longitude: float,
    pv_capacity_kwp: float,
    start_date: date,
    prediction_model_minutes: int,
    progress: Callable[[int, str], None] = lambda *_: None,
) -> pd.DataFrame:
    # Check model availability before performing the external request.
    load_prediction_model(prediction_model_minutes)
    end = start_date + timedelta(days=13)
    progress(2, "Fetching 14 days of forecast weather")
    weather = get_forecast_weather(
        latitude,
        longitude,
        start_date.isoformat(),
        end.isoformat(),
        interval_minutes=prediction_model_minutes,
        timeout=45,
    )
    # 19:00 is an end boundary, never a new operating slot.
    times = pd.to_datetime(weather.timestamp, utc=True).dt.tz_convert("Asia/Colombo")
    weather = weather.loc[times.dt.hour * 60 + times.dt.minute < 1140].copy()
    rows = weather.to_dict(orient="records")
    for row in rows:
        row.update(
            latitude=latitude,
            longitude=longitude,
            pv_capacity_kwp=pv_capacity_kwp,
        )
    progress(8, "Generating solar power predictions")
    prediction_chunks = []
    for start in range(0, len(rows), 256):
        predicted = predict_solar_power(
            rows[start : start + 256], interval_minutes=prediction_model_minutes
        )
        if len(predicted) != len(rows[start : start + 256]):
            raise RuntimeError(
                "The prediction model returned a mismatched number of rows."
            )
        prediction_chunks.extend(
            predicted.predicted_power_kw.to_numpy(dtype=float).tolist()
        )
    if (
        len(prediction_chunks) != len(rows)
        or not np.isfinite(prediction_chunks).all()
        or (np.array(prediction_chunks) < 0).any()
    ):
        raise RuntimeError("The model returned invalid solar predictions.")
    predictions = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                [row["timestamp"] for row in rows], utc=True
            ).tz_convert("Asia/Colombo"),
            "solar_kw": prediction_chunks,
        }
    )
    predictions["slot"] = predictions.timestamp.dt.floor("15min")
    expected_samples = 15 // prediction_model_minutes
    if not predictions.groupby("slot").size().eq(expected_samples).all():
        raise RuntimeError(
            "Forecast coverage is incomplete for one or more scheduling slots."
        )
    # Conservative reduction, not a claim of measured interval-average power.
    slots = (
        predictions.groupby("slot", as_index=False)
        .solar_kw.min()
        .rename(columns={"slot": "timestamp"})
    )
    expected = pd.DatetimeIndex(
        [
            datetime.combine(start_date + timedelta(days=day), time(6), LOCAL_TZ)
            + timedelta(minutes=15 * offset)
            for day in range(14)
            for offset in range(52)
        ]
    )
    if list(slots.timestamp) != list(expected):
        raise RuntimeError("Forecast does not cover all 14 daytime windows.")
    return slots
