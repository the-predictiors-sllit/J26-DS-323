"""Quick check that the live forecast works on THIS computer (needs internet).  Run:  python check_open_meteo.py"""
import sys, copy
sys.path.insert(0, "src")
from data_loader import load_config
import weather as wx

cfg = load_config()
pv = copy.deepcopy(cfg["pv"])
now_hour = wx.datetime.now(wx.ZoneInfo(wx.TZ)).hour
try:
    f = wx.get_forecast(pv["lat"], pv["lon"], now_hour, pv)
except wx.ForecastError as e:
    print("FAILED:", e); sys.exit(1)
print("Open-Meteo works. Plan window starts", f["start"], "\n")
print("hour  weather  cloud%  rain_mm  temp  sun W/m2  solar kWh per kWp")
for h in f["hours"]:
    print(f"{h['hour_of_day']:02d}    {h['label']:7s}  {h['cloud_pct']:5d}  {h['rain_mm']:7.1f}  {h['temp_c']:4.1f}  {h['ghi_wm2']:8d}  {h['pv_kwh_per_kwp']:.3f}")
print("\nTotal solar over 24 h per kWp:", round(sum(h["pv_kwh_per_kwp"] for h in f["hours"]), 2), "kWh")
