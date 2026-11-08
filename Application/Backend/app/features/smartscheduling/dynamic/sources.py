"""Historical data adapters and weather-based solar predictions."""
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol
from zoneinfo import ZoneInfo
import os
import numpy as np
import pandas as pd
from ..solar_prediction.inference import predict_solar_power
from ..solar_prediction.weather import get_historical_weather

TZ = ZoneInfo("Asia/Colombo")
DEFAULT_CSV = Path(__file__).resolve().parents[3] / "data" / "smart_scheduling" / "meepe.csv"


class ObservationSource(Protocol):
    def read_day(self, day: date) -> pd.DataFrame: ...


@dataclass
class CsvObservationSource:
    path: Path

    def read_day(self, day: date) -> pd.DataFrame:
        frame = pd.read_csv(self.path, usecols=["dataTimestamp", "pac"])
        timestamp = pd.to_datetime(frame.dataTimestamp, unit="ms", utc=True, errors="raise").dt.tz_convert(TZ)
        power = pd.to_numeric(frame.pac, errors="raise") / 1000
        if timestamp.isna().any() or timestamp.duplicated().any() or not np.isfinite(power).all() or (power < 0).any():
            raise ValueError("CSV contains missing or duplicate timestamps or invalid power readings.")
        frame = pd.DataFrame({"timestamp": timestamp, "actual_kw": power}).sort_values("timestamp")
        return frame.loc[frame.timestamp.dt.date == day].reset_index(drop=True)


def configured_source() -> ObservationSource:
    return CsvObservationSource(Path(os.getenv("SOLAR_REPLAY_CSV", str(DEFAULT_CSV))))


def available_dates(source: ObservationSource) -> list[str]:
    if not isinstance(source, CsvObservationSource):
        raise ValueError("Date discovery is not supported by this source.")
    frame = pd.read_csv(source.path, usecols=["dataTimestamp"])
    times = pd.to_datetime(frame.dataTimestamp, unit="ms", utc=True, errors="raise").dt.tz_convert(TZ)
    if times.isna().any():
        raise ValueError("CSV contains missing timestamps.")
    return sorted({v.isoformat() for v in times.dt.date})


def historical_predictions(day: date, lat: float, lon: float, capacity: float) -> pd.DataFrame:
    # Reanalysis is retrospective, not an archived day-ahead forecast.
    weather = get_historical_weather(lat, lon, day.isoformat(), interval_minutes=5, timeout=45)
    weather = weather.loc[pd.to_datetime(weather.timestamp, utc=True).dt.tz_convert(TZ).dt.hour < 19].copy()
    rows = weather.to_dict("records")
    for row in rows:
        row.update(latitude=lat, longitude=lon, pv_capacity_kwp=capacity)
    predictions = predict_solar_power(rows, interval_minutes=5)
    frame = pd.DataFrame({"timestamp": pd.to_datetime(weather.timestamp, utc=True).dt.tz_convert(TZ),
                          "solar_kw": predictions.predicted_power_kw.to_numpy()})
    frame["slot"] = frame.timestamp.dt.floor("15min")
    if not frame.groupby("slot").size().eq(3).all():
        raise ValueError("Historical weather does not cover every 5-minute prediction.")
    return frame.groupby("slot", as_index=False).solar_kw.min().rename(columns={"slot": "timestamp"})


