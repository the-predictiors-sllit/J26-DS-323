"""A common full-year interval-mean irradiance interface for physics and CSV data."""

import io
import re
import numpy as np
import pandas as pd
from pvlib.location import Location
from .schema import SolarSettings


def annual_starts(s: SolarSettings):
    return pd.date_range(
        f"{s.year}-01-01",
        f"{s.year+1}-01-01",
        freq=f"{s.interval_minutes}min",
        tz=s.timezone,
        inclusive="left",
    )


def load_weather(s: SolarSettings, csv_bytes: bytes | None = None):
    starts = annual_starts(s)
    midpoint = starts + pd.Timedelta(minutes=s.interval_minutes / 2)
    # Explicit altitude avoids automatic altitude lookup/network requests.
    location = Location(s.latitude, s.longitude, tz=s.timezone, altitude=s.altitude_m)
    position = location.get_solarposition(midpoint)
    warnings = []
    metadata = None
    if s.weather_mode == "clear_sky":
        if csv_bytes is not None:
            raise ValueError("Choose CSV weather mode to use the uploaded file.")
        frame = location.get_clearsky(
            midpoint, model="ineichen", solar_position=position
        )[["ghi", "dni", "dhi"]]
        source = "pvlib Ineichen clear sky; bundled Linke turbidity climatology"
        warnings.append(
            "Clear-sky irradiance excludes actual cloud/rain variability. Energy is a clear-sky scenario, not a weather-adjusted annual forecast."
        )
    elif s.weather_mode == "historical":
        if csv_bytes is not None:
            raise ValueError("Historical mode downloads its own data; remove the CSV upload.")
        from .historical import historical_weather
        values, metadata, messages = historical_weather(s, starts)
        frame = pd.DataFrame(values, index=midpoint, columns=["ghi", "dni", "dhi"])
        source = f"Open-Meteo Historical Weather API / ERA5; full local year {s.year}; hourly GHI/DNI/DHI"
        warnings.extend(messages)
    else:
        if not csv_bytes:
            raise ValueError("CSV weather mode requires a full-year irradiance CSV.")
        try:
            frame = pd.read_csv(io.BytesIO(csv_bytes))
        except Exception as exc:
            raise ValueError(
                "Cannot read weather CSV; use a UTF-8 comma-separated file."
            ) from exc
        if not {"timestamp", "ghi", "dni", "dhi"} <= set(frame.columns):
            raise ValueError(
                "Weather CSV needs timestamp, ghi, dni and dhi columns (irradiance in W/m²)."
            )
        if len(frame) != len(starts):
            raise ValueError(
                f"Expected {len(starts)} rows for the entire {s.year} at {s.interval_minutes}-minute intervals; received {len(frame)}. No missing periods are filled automatically."
            )
        values = frame["timestamp"].astype(str)
        if not values.map(lambda v: bool(re.search(r"(Z|[+-]\d{2}:\d{2})$", v))).all():
            raise ValueError(
                "Every timestamp must include a timezone offset, e.g. 2026-01-01T00:00:00+05:30."
            )
        try:
            actual = pd.DatetimeIndex(pd.to_datetime(values, utc=True)).tz_convert(
                s.timezone
            )
        except Exception as exc:
            raise ValueError("Invalid timestamp in weather CSV.") from exc
        if not np.array_equal(actual.asi8, starts.asi8):
            raise ValueError(
                "CSV timestamps must be ordered, unique interval STARTS covering exactly the selected local year and interval, with no gaps."
            )
        try:
            frame = frame[["ghi", "dni", "dhi"]].astype(float)
        except Exception as exc:
            raise ValueError("GHI, DNI and DHI must be numeric W/m² values.") from exc
        if (
            not np.isfinite(frame.to_numpy()).all()
            or ((frame < 0) | (frame > 2000)).to_numpy().any()
        ):
            raise ValueError(
                "Irradiance must be finite, nonnegative and at most 2000 W/m². Handle missing-value flags before uploading."
            )
        frame.index = midpoint
        source = "User-supplied full-year CSV, interval means; provenance must be recorded by user"
    daylight = position["apparent_zenith"].to_numpy() < 90
    arr = frame.to_numpy(dtype=float, copy=True)
    if not np.isfinite(arr).all():
        raise ValueError("Weather model returned non-finite irradiance.")
    if np.any(arr[~daylight] > 20):
        warnings.append(
            "Nonzero nighttime irradiance detected; intervals with the sun below the horizon were set to zero. Check timestamp conventions."
        )
    arr[~daylight] = 0
    ghi, dni, dhi = arr.T
    closure = dni * np.maximum(0, np.cos(np.deg2rad(position["apparent_zenith"]))) + dhi
    inconsistent = (
        daylight & (ghi > 50) & (np.abs(ghi - closure) > np.maximum(30, ghi * 0.2))
    )
    if inconsistent.sum() > max(5, daylight.sum() * 0.02):
        warnings.append(
            "GHI differs substantially from DNI*cos(zenith)+DHI in several intervals. Check source, units and interval timing before trusting energy results."
        )
    return {
        "times": midpoint,
        "position": position,
        "ghi": ghi,
        "dni": dni,
        "dhi": dhi,
        "daylight": daylight,
        "dt_hours": s.interval_minutes / 60,
        "source": source,
        "metadata": metadata,
        "warnings": warnings,
    }
