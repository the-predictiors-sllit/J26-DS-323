"""Live weather forecast from Open-Meteo (free, no key for normal use) turned into a solar forecast.
Open-Meteo gives sunlight (W/m2), cloud, rain and temperature for the next days. We run the SAME pvlib model that
built the typical-day profiles, so a live forecast and the typical day are directly comparable.
If the internet or the service fails, callers fall back to the typical day (see planner.py and api/main.py)."""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import pvlib
from pvlib.temperature import sapm_cell, TEMPERATURE_MODEL_PARAMETERS

TZ = "Asia/Colombo"
URL = "https://api.open-meteo.com/v1/forecast"
HOURLY = ("temperature_2m,cloud_cover,precipitation,shortwave_radiation,"
          "direct_normal_irradiance,diffuse_radiation,wind_speed_10m")
CACHE_SECONDS = 15 * 60
_CACHE = {}


class ForecastError(RuntimeError):
    """The live forecast could not be fetched or did not cover the next 24 hours."""


def fetch_raw(lat, lon, days=3, timeout=6):
    """Call Open-Meteo once (cached for 15 minutes per place). Returns the parsed JSON."""
    key = (round(float(lat), 2), round(float(lon), 2))
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    q = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "hourly": HOURLY, "timezone": TZ,
                                "forecast_days": days, "wind_speed_unit": "ms"})
    try:
        with urllib.request.urlopen(f"{URL}?{q}", timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:                                   # no internet, timeout, bad reply
        raise ForecastError(f"could not reach Open-Meteo ({type(e).__name__})") from e
    if "hourly" not in data:
        raise ForecastError("Open-Meteo sent an unexpected reply")
    _CACHE[key] = (time.time(), data)
    return data


def window_start(start_hour, now=None):
    """First hour of the plan as a local clock time: the next time the clock shows start_hour (now counts)."""
    now = (now or datetime.now(ZoneInfo(TZ))).replace(tzinfo=None, minute=0, second=0, microsecond=0)
    start = now.replace(hour=int(start_hour))
    return start if start >= now else start + timedelta(days=1)


def label_for(cloud_pct, rain_mm):
    """Plain word for the hour, using the same words as the manual weather outlook."""
    if rain_mm >= 0.3:
        return "rainy"
    return "cloudy" if cloud_pct >= 60 else "sunny"


def hourly_window(raw, start, horizon=24):
    """Rows for the plan hours. Open-Meteo values are the mean of the PRECEDING hour, so plan hour [h, h+1)
    uses the value stamped h+1."""
    h = raw["hourly"]
    df = pd.DataFrame({k: h[k] for k in h if k != "time"}, index=pd.to_datetime(h["time"]))
    stamps = [start + timedelta(hours=t + 1) for t in range(horizon)]
    missing = [s for s in stamps if s not in df.index]
    if missing:
        raise ForecastError("the forecast does not cover the next 24 hours")
    w = df.loc[stamps].copy()
    if w[["shortwave_radiation", "cloud_cover", "precipitation", "temperature_2m"]].isna().any().any():
        raise ForecastError("the forecast has gaps")
    w[["direct_normal_irradiance", "diffuse_radiation", "wind_speed_10m"]] = \
        w[["direct_normal_irradiance", "diffuse_radiation", "wind_speed_10m"]].fillna(0.0)
    return w


def pv_kwh_per_kwp(w, lat, lon, pv_cfg):
    """Solar energy per hour from 1 kWp, from the forecast sunlight (same pvlib steps as pv_model.simulate_pv)."""
    center = (w.index - pd.Timedelta(minutes=30)).tz_localize(TZ, nonexistent="shift_forward")
    loc = pvlib.location.Location(lat, lon, tz=TZ)
    sp = loc.get_solarposition(center)
    extra = pvlib.irradiance.get_extra_radiation(center)
    poa = pvlib.irradiance.get_total_irradiance(
        pv_cfg["tilt_deg"], pv_cfg["azimuth_deg"], sp["apparent_zenith"], sp["azimuth"],
        dni=w["direct_normal_irradiance"].to_numpy(), ghi=w["shortwave_radiation"].to_numpy(),
        dhi=w["diffuse_radiation"].to_numpy(), dni_extra=extra, model="haydavies")
    tcell = sapm_cell(poa["poa_global"], w["temperature_2m"].to_numpy(), w["wind_speed_10m"].to_numpy(),
                      **TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"])
    dc = poa["poa_global"] / 1000 * (1 + pv_cfg["temp_coeff_per_c"] * (tcell - 25))
    ac = (dc * pv_cfg["system_loss_factor"]).clip(lower=0).fillna(0.0)
    return [round(float(x), 4) for x in ac]


def get_forecast(lat, lon, start_hour, pv_cfg, fetcher=None, now=None):
    """Live forecast for the 24 hours from start_hour. Raises ForecastError if anything goes wrong."""
    raw = (fetcher or fetch_raw)(lat, lon)
    start = window_start(start_hour, now)
    w = hourly_window(raw, start)
    pv = pv_kwh_per_kwp(w, lat, lon, pv_cfg)
    hours = []
    for i, (_, r) in enumerate(w.iterrows()):
        hours.append({"hour_of_day": (start.hour + i) % 24,
                      "label": label_for(float(r["cloud_cover"]), float(r["precipitation"])),
                      "cloud_pct": round(float(r["cloud_cover"])),
                      "rain_mm": round(float(r["precipitation"]), 1),
                      "temp_c": round(float(r["temperature_2m"]), 1),
                      "ghi_wm2": round(float(r["shortwave_radiation"])),
                      "pv_kwh_per_kwp": pv[i]})
    return {"source": "open-meteo", "start": start.isoformat(), "month": start.month,
            "is_weekend": start.weekday() >= 5, "hours": hours}
