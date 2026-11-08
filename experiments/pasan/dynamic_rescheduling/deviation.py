"""Pure, source-independent shortfall detector for replay and future live inputs."""
from dataclasses import dataclass
from datetime import datetime, timedelta
import math

from .measurements import Measurement


@dataclass(frozen=True)
class Detection:
    status: str
    shortfall_kw: float | None = None
    relative_shortfall: float | None = None
    reason: str = ""


def detect_shortfall(
    *, forecast_kw: float, observation: Measurement | None, now: datetime,
    max_age: timedelta = timedelta(minutes=10), absolute_threshold_kw: float = 0.3,
    relative_threshold: float = 0.2, minimum_forecast_kw: float = 0.2,
) -> Detection:
    """Compare a forecast to an available measurement, without using future values.

    Values must refer to comparable intervals; timestamps alone do not establish
    whether a reading and a model prediction have equivalent semantics.
    """
    values = (forecast_kw, absolute_threshold_kw, relative_threshold, minimum_forecast_kw)
    if any(not math.isfinite(x) or x < 0 for x in values) or relative_threshold > 1:
        raise ValueError("Forecast and thresholds must be finite and nonnegative; relative threshold must be <= 1.")
    if now.utcoffset() is None or max_age <= timedelta(0):
        raise ValueError("Use an aware timestamp and positive maximum age.")
    if observation is None:
        return Detection("unavailable", reason="No measurement available.")
    if observation.timestamp.utcoffset() is None or not math.isfinite(observation.power_kw) or observation.power_kw < 0:
        raise ValueError("Observation must have an aware timestamp and finite nonnegative power.")
    age = now - observation.timestamp
    if age < timedelta(0):
        raise ValueError("A future observation cannot be used.")
    if age > max_age:
        return Detection("stale", reason="Measurement is too old.")
    difference = max(forecast_kw - observation.power_kw, 0.0)
    relative = difference / forecast_kw if forecast_kw >= minimum_forecast_kw and forecast_kw > 0 else None
    triggered = relative is not None and difference >= absolute_threshold_kw and relative >= relative_threshold
    return Detection("shortfall" if triggered else "normal", difference, relative,
                     "Thresholds are illustrative and must be evaluated.")
