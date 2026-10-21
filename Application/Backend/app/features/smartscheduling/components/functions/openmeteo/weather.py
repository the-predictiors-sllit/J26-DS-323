"""Fetch model weather features, preserving training's backward hourly join.

No HTTP calls run at import time. All returned timestamps are ISO 8601 strings
with an explicit Sri Lankan UTC offset. Weather values are not interpolated.
"""

from __future__ import annotations

import json
import math
import re
from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

TIMEZONE = "Asia/Colombo"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HISTORICAL_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_DAYS = 16

# Keep exactly the weather names used by the training/prediction pipeline.
WEATHER_COLUMNS = {
    "temperature_2m": "weather_temperature_c",
    "relative_humidity_2m": "weather_relative_humidity_pct",
    "wind_speed_10m": "weather_wind_speed_ms",
    "cloud_cover": "weather_cloud_cover_pct",
    "cloud_cover_low": "weather_cloud_cover_low_pct",
    "cloud_cover_mid": "weather_cloud_cover_mid_pct",
    "cloud_cover_high": "weather_cloud_cover_high_pct",
    "shortwave_radiation_instant": "weather_ghi_instant_wm2",
    "direct_normal_irradiance_instant": "weather_dni_instant_wm2",
    "diffuse_radiation_instant": "weather_dhi_instant_wm2",
    "precipitation": "weather_preceding_hour_precipitation_mm",
    "rain": "weather_preceding_hour_rain_mm",
}

DateInput = str | date | datetime | pd.Timestamp


class OpenMeteoError(RuntimeError):
    """Weather service failure, incomplete coverage, or missing model features."""


def _today() -> date:
    return pd.Timestamp.now(tz=TIMEZONE).date()


def _is_date_only(value: DateInput) -> bool:
    return (isinstance(value, date) and not isinstance(value, datetime)) or (
        isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is not None
    )


def _local_timestamp(value: DateInput) -> pd.Timestamp:
    if not isinstance(value, (str, date, datetime, pd.Timestamp)):
        raise ValueError("Dates must be ISO date strings or date/datetime objects.")
    try:
        timestamp = pd.Timestamp(value)
        if pd.isna(timestamp):
            raise ValueError("Missing timestamp.")
        if timestamp.tzinfo is None:
            return timestamp.tz_localize(TIMEZONE)
        return timestamp.tz_convert(TIMEZONE)
    except (ValueError, TypeError, OverflowError) as exc:
        raise ValueError(f"Invalid date or timestamp: {value!r}") from exc


def _targets(
    start: DateInput, end: DateInput | None, interval: int, daytime_only: bool
) -> pd.DatetimeIndex:
    if isinstance(interval, bool) or interval not in (5, 15, 60):
        raise ValueError("interval_minutes must be 5, 15, or 60.")
    if not isinstance(daytime_only, bool):
        raise ValueError("daytime_only must be True or False.")
    first = _local_timestamp(start)
    if _is_date_only(start):
        first = first.normalize() + pd.Timedelta(hours=6 if daytime_only else 0)

    last_input = start if end is None else end
    last = _local_timestamp(last_input)
    if _is_date_only(last_input):
        last = last.normalize() + pd.Timedelta(
            minutes=19 * 60 if daytime_only else 24 * 60 - interval
        )
    if first > last:
        raise ValueError("start must be at or before end.")

    for name, timestamp in (("start", first), ("end", last)):
        if (
            timestamp.second
            or timestamp.microsecond
            or timestamp.nanosecond
            or timestamp.minute % interval
        ):
            raise ValueError(
                f"{name} must align to a {interval}-minute step with zero seconds."
            )

    times = pd.date_range(first, last, freq=f"{interval}min")
    if daytime_only:
        minutes = times.hour * 60 + times.minute
        times = times[(minutes >= 360) & (minutes <= 1140)]
    if times.empty:
        raise ValueError(
            "The requested range contains no times between 06:00 and 19:00."
        )
    return times.as_unit("ns")


def _coordinates(latitude: float, longitude: float) -> tuple[float, float]:
    try:
        latitude, longitude = float(latitude), float(longitude)
    except (ValueError, TypeError) as exc:
        raise ValueError("Coordinates must be numeric.") from exc
    if not math.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("latitude must be finite and between -90 and 90.")
    if not math.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("longitude must be finite and between -180 and 180.")
    return latitude, longitude


def _request_hourly(url: str, params: dict, timeout: float) -> dict:
    request = Request(
        f"{url}?{urlencode(params)}",
        headers={"Accept": "application/json", "User-Agent": "SOLAI-weather/1.0"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except HTTPError as exc:
        try:
            reason = json.loads(exc.read().decode("utf-8")).get("reason", str(exc))
        except (ValueError, AttributeError, UnicodeError):
            reason = str(exc)
        raise OpenMeteoError(f"Open-Meteo HTTP {exc.code}: {reason}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise OpenMeteoError(f"Cannot reach Open-Meteo: {exc}") from exc
    except (ValueError, UnicodeError) as exc:
        raise OpenMeteoError("Open-Meteo returned invalid JSON.") from exc
    if not isinstance(payload, dict):
        raise OpenMeteoError("Open-Meteo returned an unexpected response.")
    if payload.get("error"):
        raise OpenMeteoError(str(payload.get("reason", "Unknown Open-Meteo error.")))
    return payload


def _hourly_frame(payload: dict) -> pd.DataFrame:
    hourly = payload.get("hourly")
    if (
        not isinstance(hourly, dict)
        or not isinstance(hourly.get("time"), list)
        or not hourly["time"]
    ):
        raise OpenMeteoError("Open-Meteo returned no hourly data.")
    count = len(hourly["time"])
    for name in WEATHER_COLUMNS:
        if not isinstance(hourly.get(name), list) or len(hourly[name]) != count:
            raise OpenMeteoError(f"Missing or incomplete weather variable: {name}")
    try:
        # Unix timestamps avoid ambiguity in fractional UTC-offset timezones.
        times = pd.to_datetime(hourly["time"], unit="s", utc=True, errors="raise")
        if times.isna().any():
            raise ValueError("Missing timestamps.")
        frame = pd.DataFrame({name: hourly[name] for name in WEATHER_COLUMNS})
        frame = frame.apply(pd.to_numeric, errors="raise").rename(
            columns=WEATHER_COLUMNS
        )
        frame.insert(0, "_weather_timestamp", times.tz_convert(TIMEZONE).as_unit("ns"))
    except (ValueError, TypeError, OverflowError) as exc:
        raise OpenMeteoError(
            "Open-Meteo returned invalid weather values or timestamps."
        ) from exc
    if frame["_weather_timestamp"].duplicated().any():
        raise OpenMeteoError("Open-Meteo returned duplicate hourly timestamps.")
    return frame.sort_values("_weather_timestamp")


def _fetch_weather(
    latitude: float,
    longitude: float,
    times: pd.DatetimeIndex,
    *,
    historical: bool,
    timeout: float,
) -> pd.DataFrame:
    if (
        not isinstance(timeout, (int, float))
        or not math.isfinite(timeout)
        or timeout <= 0
    ):
        raise ValueError("timeout must be a finite positive number of seconds.")

    # A buffer supports the backward join even at local midnight, including
    # responses whose hourly grid is aligned with UTC rather than local hours.
    fetch_start = (times[0] - pd.Timedelta(hours=1)).date()
    if historical:
        fetch_start = max(date(1940, 1, 1), fetch_start)
    fetch_end = times[-1].date()
    frames = []

    # Historical requests are split into <=31-day chunks for manageable responses.
    # This is our batching choice, not a claimed Open-Meteo historical range limit.
    cursor = fetch_start
    while cursor <= fetch_end:
        stop = min(cursor + timedelta(days=30), fetch_end)
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": cursor.isoformat(),
            "end_date": stop.isoformat(),
            "hourly": ",".join(WEATHER_COLUMNS),
            "timezone": TIMEZONE,
            "timeformat": "unixtime",
            "temperature_unit": "celsius",
            "wind_speed_unit": "ms",
            "precipitation_unit": "mm",
        }
        frames.append(
            _hourly_frame(
                _request_hourly(
                    HISTORICAL_URL if historical else FORECAST_URL, params, timeout
                )
            )
        )
        cursor = stop + timedelta(days=1)

    hourly = pd.concat(frames, ignore_index=True).sort_values("_weather_timestamp")
    if hourly["_weather_timestamp"].duplicated().any():
        raise OpenMeteoError(
            "Open-Meteo returned overlapping hourly data across batches."
        )
    aligned = pd.merge_asof(
        pd.DataFrame({"timestamp": times}),
        hourly,
        left_on="timestamp",
        right_on="_weather_timestamp",
        direction="backward",
        allow_exact_matches=True,
        tolerance=pd.Timedelta("59min 59s"),
    )

    missing = ~np.isfinite(
        aligned[list(WEATHER_COLUMNS.values())].to_numpy(dtype=float)
    )
    if missing.any():
        first_bad_row = int(np.flatnonzero(missing.any(axis=1))[0])
        raise OpenMeteoError(
            "Required weather features are missing or unavailable near "
            f"{aligned['timestamp'].iloc[first_bad_row].isoformat()}. "
            "The selected model/date may lack coverage, or historical data may not be published yet."
        )

    # Keep alignment diagnostics in attrs, not in prediction input columns.
    weather_timestamps = aligned.pop("_weather_timestamp")
    aligned["timestamp"] = aligned["timestamp"].map(lambda value: value.isoformat())
    aligned.attrs.update(
        {
            "source": (
                "Open-Meteo Historical Weather API"
                if historical
                else "Open-Meteo Forecast API"
            ),
            "timezone": TIMEZONE,
            "weather_resolution": "hourly",
            "alignment": "latest hourly weather at or before each timestamp; no interpolation",
            "weather_timestamps": [value.isoformat() for value in weather_timestamps],
            "requested_latitude": latitude,
            "requested_longitude": longitude,
        }
    )
    return aligned


def get_forecast_weather(
    latitude: float,
    longitude: float,
    start: DateInput,
    end: DateInput | None = None,
    *,
    interval_minutes: int = 15,
    daytime_only: bool = True,
    timeout: float = 30,
) -> pd.DataFrame:
    """Return timestamp + the 12 model weather features for one or many times.

    Naive timestamps and dates use Asia/Colombo. A single datetime returns one
    row. A date returns that day's 06:00–19:00 rows by default. Date ranges are
    inclusive. Use interval_minutes=5 or 15 for the corresponding solar model.

    This wrapper accepts today through today+15 local dates, inclusive (16
    calendar days total). The provider may have shorter coverage per variable.
    Out-of-window dates are rejected even for a short requested range.
    """
    latitude, longitude = _coordinates(latitude, longitude)
    times = _targets(start, end, interval_minutes, daytime_only)
    today = _today()
    last_day = today + timedelta(days=FORECAST_DAYS - 1)
    if times[0].date() < today or times[-1].date() > last_day:
        raise ValueError(
            "Forecast requests must be within "
            f"{today.isoformat()} through {last_day.isoformat()} in Sri Lankan time "
            "(today plus the next 15 dates). Use historical weather for earlier dates."
        )
    return _fetch_weather(latitude, longitude, times, historical=False, timeout=timeout)


def get_historical_weather(
    latitude: float,
    longitude: float,
    start: DateInput,
    end: DateInput | None = None,
    *,
    interval_minutes: int = 15,
    daytime_only: bool = True,
    timeout: float = 30,
) -> pd.DataFrame:
    """Return historical model weather features using /v1/archive.

    Input/output rules match get_forecast_weather. Coverage begins in 1940;
    recent dates depend on provider publication and selected weather datasets.
    Historical data is modeled/reanalysis data, not a station observation.
    Future dates are rejected. Missing features raise OpenMeteoError.
    """
    latitude, longitude = _coordinates(latitude, longitude)
    times = _targets(start, end, interval_minutes, daytime_only)
    if times[0].date() < date(1940, 1, 1):
        raise ValueError(
            "Historical weather requests must start on or after 1940-01-01."
        )
    if times[-1].date() > _today():
        raise ValueError(
            "Historical weather cannot include future dates. Use forecast weather."
        )
    return _fetch_weather(latitude, longitude, times, historical=True, timeout=timeout)
