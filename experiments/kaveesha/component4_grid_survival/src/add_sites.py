"""Add battery-equipped Type-A station logs. Usage: python add_sites.py <file.csv> <site_name> <out_dir>
Output: <site>_hourly.csv with pv, load, grid import/export, battery charge/discharge (kWh), mean SoC. Local time."""
import sys, pandas as pd
from pathlib import Path
f, site, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
d = pd.read_csv(f); d["t"] = pd.to_datetime(d["timestamp"]) + pd.Timedelta(hours=5, minutes=30)
d = d.sort_values("t").drop_duplicates("t").set_index("t")
d["load"]   = d["consumeEnergy"]                       # W, verified vs PV+grid+battery balance
d["import"] = (-d["psum"]).clip(lower=0); d["export"] = d["psum"].clip(lower=0)
d["bat_charge"]    = d["batteryPower"].clip(lower=0)      # +ve = charging (checked against SoC rise)
d["bat_discharge"] = (-d["batteryPower"]).clip(lower=0)
h = d[["power","load","import","export","bat_charge","bat_discharge"]].resample("1h").mean().div(1000)
h.columns = ["pv_kwh","load_kwh","grid_import_kwh","grid_export_kwh","battery_charge_kwh","battery_discharge_kwh"]
h["soc_pct"] = d["batteryCapacitySocList"].resample("1h").mean()
h["n"] = d["power"].resample("1h").size(); h = h[h.n >= 6].drop(columns="n")
h.index.name = "datetime_local"; h.round(4).to_csv(out/f"{site}_hourly.csv"); print(site, len(h), "hours")
