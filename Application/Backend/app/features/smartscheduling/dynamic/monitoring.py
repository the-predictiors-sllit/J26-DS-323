"""Causal deviation checks, independent of the optimizer and data source."""
from dataclasses import dataclass
import pandas as pd


@dataclass(frozen=True)
class Assessment:
    observed_kw: float | None
    predicted_kw: float | None
    samples: int
    reason: str


def assess_observations(actual: pd.DataFrame, forecast: pd.DataFrame, now: pd.Timestamp, method: str) -> Assessment:
    """Use only observations at or before now; reject inadequate coverage."""
    if method == "latest":
        readings = actual.loc[(actual.timestamp <= now) & (actual.timestamp >= now - pd.Timedelta(minutes=10))].sort_values("timestamp")
        if readings.empty:
            return Assessment(None, None, 0, "No reading from the last 10 minutes.")
        predicted = forecast.loc[forecast.timestamp <= now].sort_values("timestamp")
        if predicted.empty:
            return Assessment(None, None, 0, "No prediction available for this time.")
        return Assessment(float(readings.actual_kw.iloc[-1]), float(predicted.solar_kw.iloc[-1]), 1, "Latest available reading")
    if method not in ("recent_average", "recent_average_60"):
        raise ValueError("Unknown detection method.")
    minutes = 60 if method == "recent_average_60" else 30
    minimum_samples = 7 if minutes == 60 else 4
    # Look back from the decision time; a later meter reading must never affect it.
    start = now - pd.Timedelta(minutes=minutes)
    readings = actual.loc[(actual.timestamp >= start) & (actual.timestamp <= now)].sort_values("timestamp")
    if (len(readings) < minimum_samples or readings.empty or now - readings.timestamp.iloc[-1] > pd.Timedelta(minutes=10)
            or readings.timestamp.iloc[0] > start + pd.Timedelta(minutes=10)
            or readings.timestamp.diff().dropna().gt(pd.Timedelta(minutes=10)).any()):
        return Assessment(None, None, len(readings), f"Insufficient data: need at least {minimum_samples} readings across {minutes} minutes, with gaps at most 10 minutes.")
    readings = readings.copy()
    predictions = forecast[["timestamp", "solar_kw"]].sort_values("timestamp").copy()
    # CSV epoch milliseconds and model timestamps can have different pandas units.
    readings["timestamp"] = readings.timestamp.dt.as_unit("ns")
    predictions["timestamp"] = predictions.timestamp.dt.as_unit("ns")
    # Compare each observation with the latest prediction for that past time.
    paired = pd.merge_asof(readings, predictions,
                           on="timestamp", direction="backward", tolerance=pd.Timedelta(minutes=15))
    if paired.solar_kw.isna().any():
        return Assessment(None, None, len(readings), "A matching earlier prediction is missing.")
    return Assessment(float(paired.actual_kw.mean()), float(paired.solar_kw.mean()), len(paired), f"{minutes}-minute sample average")
