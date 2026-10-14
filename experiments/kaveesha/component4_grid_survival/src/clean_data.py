"""Clean raw inverter logs into hourly CSVs for Component 4.
Usage: python clean_data.py <raw_dir> <out_dir>
Units: all energy in kWh per hour (= average kW). Times are Sri Lanka local (UTC+5:30)."""
import sys, json, pandas as pd, numpy as np
from pathlib import Path
raw, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)

def hourly(df, cols):
    df = df.set_index("t").sort_index()
    df = df[~df.index.duplicated()]
    return df[cols].resample("1h").mean().div(1000)          # W -> kW (= kWh in one hour)

def clip_report(h):
    h = h.copy()
    return h

# ---------- 1) Weligama site: PV + household load ----------
w = pd.read_csv(raw/"CRN_53974__Weligama_.csv")
w["t"] = pd.to_datetime(w["timestamp"]) + pd.Timedelta(hours=5, minutes=30)   # file timestamps are UTC
w["pv_w"]   = w["power"]
w["load_w"] = (w["power"] - w["psum"]).clip(lower=0)      # load = PV + import - export (no battery in this log)
w["import_w"] = (-w["psum"]).clip(lower=0); w["export_w"] = w["psum"].clip(lower=0)
hw = hourly(w, ["pv_w","load_w","import_w","export_w"])
hw.columns = ["pv_kwh","load_kwh","grid_import_kwh","grid_export_kwh"]
cnt = w.set_index("t").sort_index().resample("1h").size()
hw["n_readings"] = cnt
hw = hw[hw.n_readings >= 6]                                 # drop hours with <6 of 12 readings
hw = hw.drop(columns="n_readings")
hw.index.name = "datetime_local"
hw.round(4).to_csv(out/"weligama_hourly.csv")

# household load profile by hour of day (+ weekday/weekend)
lp = hw.copy(); lp["hour"] = lp.index.hour; lp["weekend"] = lp.index.dayofweek >= 5
prof = lp.groupby("hour")["load_kwh"].agg(["mean","std","min","max"]).round(4)
prof.columns = ["avg_load_kwh","std","min","max"]; prof.to_csv(out/"load_profile_hourly.csv")
lp.groupby(["weekend","hour"])["load_kwh"].mean().round(4).unstack(0).rename(columns={False:"weekday_kwh",True:"weekend_kwh"}).to_csv(out/"load_profile_weekday_weekend.csv")

# ---------- 2) Hybrid site CRN14037: longer PV + load history ----------
cols = ["timeStr","pac","psumPositiveSelling","psumNegativeBuying"]
h = pd.read_csv(raw/"1031720256230368_2026-01-01-2026-08-01_CRN14037__Hybrid__.csv", usecols=cols, low_memory=False)
h["t"] = pd.to_datetime(h["timeStr"].str.replace(r" \(UTC.*\)","",regex=True), format="%d/%m/%Y %H:%M:%S")
h["load_w"] = (h["pac"] + h["psumNegativeBuying"] - h["psumPositiveSelling"]).clip(lower=0)
hh = hourly(h.rename(columns={"pac":"pv_w","psumNegativeBuying":"import_w","psumPositiveSelling":"export_w"}).assign(),
            ["pv_w","load_w","import_w","export_w"])
hh.columns = ["pv_kwh","load_kwh","grid_import_kwh","grid_export_kwh"]
hh["n"] = h.set_index("t").sort_index().resample("1h").size(); hh = hh[hh.n>=4].drop(columns="n")
hh.index.name = "datetime_local"; hh.round(4).to_csv(out/"hybrid_crn14037_hourly.csv")

# ---------- 3) Battery series (real SoC) ----------
b = pd.read_csv(next(raw.glob("BatteryStats*.csv")))
b["t"] = pd.to_datetime(b["timestamp"])
b = b.sort_values("t").drop_duplicates("t")
b["power_w_charge_positive"] = b["power"]           # verified: +power = charging (SoC rises)
b[["t","soc","voltage","current","power_w_charge_positive"]].rename(columns={"t":"datetime"}).to_csv(out/"battery_soc_series.csv", index=False)

# ---------- 4) Battery + assumptions config ----------
cfg = {"battery": {"capacity_kwh":5.0,"min_soc_pct":20,"max_soc_pct":100,"max_charge_kw":2.7,"max_discharge_kw":3.0,
        "round_trip_efficiency":0.95,"source":"IntelliHome-5kWh-OD app screenshots; BatteryStats log (charge ~2.6 kW observed)"},
       "pv": {"system_kw":5.0,"source":"customer_details typical size; pvlib sim to be validated against weligama_hourly.csv"},
       "assumptions": ["Round-trip efficiency 0.95 is an ASSUMPTION (no measured data)",
                       "Tariff is a user input, not from data",
                       "Log timestamps converted UTC -> UTC+5:30 for Weligama; Hybrid file already local"]}
json.dump(cfg, open(out/"battery_config.json","w"), indent=2)

for f in sorted(out.glob("*")): print(f.name, (len(pd.read_csv(f)) if f.suffix==".csv" else "json"))
print(prof)
