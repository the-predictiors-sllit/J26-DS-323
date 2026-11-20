"""Validate a provider's measurements and reuse the historical detector.

This is an on-demand preview, not a scheduler, job runner or appliance control.
"""
from datetime import datetime, timedelta, timezone
import math

import pandas as pd

from ..dynamic.monitoring import assess_observations
from .providers import LiveSolarProvider, ProviderUnavailable, SolarReading
from .schemas import AssessmentRequest


def validated_readings(provider: LiveSolarProvider, start: datetime, now: datetime) -> list[SolarReading]:
    if not provider.is_implemented():
        raise ProviderUnavailable("The live solar provider is not implemented.")
    values = provider.read_between(start, now)
    seen = set()
    for item in values:
        if (item.timestamp.utcoffset() is None or not start <= item.timestamp <= now
                or not math.isfinite(item.power_kw) or item.power_kw < 0 or item.timestamp in seen):
            raise ProviderUnavailable("The provider returned invalid or duplicate readings.")
        seen.add(item.timestamp)
    return sorted(values, key=lambda item: item.timestamp)


def latest_reading(provider: LiveSolarProvider, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    values = validated_readings(provider, now - timedelta(minutes=10), now)
    if not values:
        raise ProviderUnavailable("No reading is available from the last 10 minutes.")
    last = values[-1]
    return {"timestamp": last.timestamp.isoformat(), "power_kw": last.power_kw,
            "age_seconds": (now - last.timestamp).total_seconds(), "provider": provider.name}


def preview_assessment(provider: LiveSolarProvider, request: AssessmentRequest, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    if request.forecast_available_at > now:
        raise ValueError("The supplied forecast was not available at the decision time.")
    # The original 15-minute scheduler needs a prediction for the present slot.
    # Older forecasts are rejected rather than silently used indefinitely.
    current_slot = pd.Timestamp(now).floor("15min")
    stamps = pd.to_datetime([item.timestamp for item in request.forecast], utc=True)
    if not any(stamp == current_slot for stamp in stamps):
        raise ValueError("Provide the forecast for the current 15-minute slot.")
    values = validated_readings(provider, now - timedelta(minutes=60), now)
    if not values:
        raise ProviderUnavailable("No recent measurements are available.")
    actual = pd.DataFrame({"timestamp": pd.to_datetime([item.timestamp for item in values], utc=True),
                           "actual_kw": [item.power_kw for item in values]})
    forecast = pd.DataFrame({"timestamp": stamps, "solar_kw": [item.solar_kw for item in request.forecast]}).sort_values("timestamp")
    result = assess_observations(actual, forecast, pd.Timestamp(now), request.detection_method)
    observed, predicted = result.observed_kw, result.predicted_kw
    shortfall = predicted - observed if predicted is not None and observed is not None else None
    triggered = shortfall is not None and predicted >= 0.2 and shortfall >= request.threshold_kw and shortfall / predicted >= request.threshold_ratio
    return {"decision_time": now.isoformat(), "method": request.detection_method,
            "observed_kw": observed, "predicted_kw": predicted, "shortfall_kw": shortfall,
            "samples": result.samples, "reason": result.reason, "threshold_met": triggered,
            "note": "Preview only: no cooldown, saved plan, rescheduling or appliance control is performed."}
