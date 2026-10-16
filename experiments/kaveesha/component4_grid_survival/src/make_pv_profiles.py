"""Build typical hourly solar output per 1 kWp for each month, from 2019-2025 NASA POWER weather.
Writes data/processed/pv_profiles_per_kwp.csv so the API can forecast solar WITHOUT the raw weather file.
  normal_kwh = average hour (what to expect on an ordinary day)
  sunny_kwh  = 90th percentile hour (a clear day)
Run once on a computer that has data/raw/weather/weather_hourly.csv:  python src/make_pv_profiles.py"""
import sys, copy
import numpy as np, pandas as pd
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_loader import load_config, load_weather, ROOT
from pv_model import simulate_pv

wpath = sys.argv[1] if len(sys.argv) > 1 else None
cfg = load_config()
pv_cfg = copy.deepcopy(cfg["pv"]); pv_cfg["system_kwp"] = 1.0; pv_cfg["inverter_kw"] = 99.0
pv = simulate_pv(load_weather(wpath), pv_cfg)
df = pd.DataFrame({"month": pv.index.month, "hour": pv.index.hour, "kwh": pv.to_numpy()})
g = df.groupby(["month", "hour"])["kwh"]
out = pd.DataFrame({"normal_kwh": g.mean(), "sunny_kwh": g.quantile(0.9)}).round(4).reset_index()
Path(ROOT / "data" / "processed").mkdir(parents=True, exist_ok=True)
out.to_csv(ROOT / "data" / "processed" / "pv_profiles_per_kwp.csv", index=False)
print(out.groupby("month")[["normal_kwh", "sunny_kwh"]].sum().round(2))
