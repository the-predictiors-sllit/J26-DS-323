"""Load config, weather, outage schedules and household load for Component 4."""
import json
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_config(path=None):
    """Read config/config.json (battery, PV, tariff, preference profiles)."""
    path = Path(path) if path else ROOT / "config" / "config.json"
    with open(path) as f:
        return json.load(f)


def load_weather(path=None):
    """Hourly NASA POWER weather. Returns the raw table indexed by interval START (local time, xx:30)."""
    path = Path(path) if path else ROOT / "data" / "raw" / "weather" / "weather_hourly.csv"
    w = pd.read_csv(path, parse_dates=["datetime_local"]).set_index("datetime_local")
    return w


def align_half_hour(series):
    """NASA stamps are at xx:30 (interval start). Convert to bins labelled xx:00 covering [xx:00, xx+1:00)."""
    prev = series.shift(1)
    aligned = 0.5 * (series + prev)                      # bin h:00 = half of (h-1):30 interval + half of h:30 interval
    aligned.index = aligned.index - pd.Timedelta(minutes=30)
    return aligned.dropna()


def load_outage(scenario, path=None):
    """Hourly outage flag (1 = grid down) for scenario in {mild, moderate, severe}, or a custom CSV path."""
    path = Path(path) if path else ROOT / "data" / "processed" / f"outage_{scenario}.csv"
    return pd.read_csv(path, parse_dates=["datetime_local"]).set_index("datetime_local")["outage"]


def make_load_year(index, site="weligama", seed=0, processed_dir=None):
    """Synthetic household load for any hourly index by resampling REAL days from the site's logs
    (weekday days for weekdays, weekend days for weekends). Returns kWh per hour."""
    processed_dir = Path(processed_dir) if processed_dir else ROOT / "data" / "processed"
    files = {"weligama": "weligama_hourly.csv", "crn12243": "crn12243_hourly.csv",
             "niroshan": "crn33200_niroshan_hourly.csv", "crn14037": "hybrid_crn14037_hourly.csv"}
    df = pd.read_csv(processed_dir / files[site], parse_dates=["datetime_local"]).set_index("datetime_local")
    days = {}
    for d, g in df.groupby(df.index.date):
        if len(g) == 24:
            days.setdefault(pd.Timestamp(d).dayofweek >= 5, []).append(g["load_kwh"].to_numpy())
    rng = np.random.default_rng(seed)
    out = np.zeros(len(index))
    dates = pd.Series(index.date, index=index)
    for d in dates.unique():
        pool = days.get(pd.Timestamp(d).dayofweek >= 5) or days[False]
        out[(dates == d).to_numpy()] = pool[rng.integers(len(pool))][: (dates == d).sum()]
    return pd.Series(out, index=index, name="load_kwh")
