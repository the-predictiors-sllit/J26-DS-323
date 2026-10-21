import sys; sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from api.main import app
c = TestClient(app)
print(c.get("/health").json(), list(c.get("/profiles").json()))
pv = [0]*6 + [0.1,0.4,0.8,1.2,1.5,1.7,1.6,1.4,1.0,0.6,0.2] + [0]*7
body = dict(profile="resilience", soc_pct=50, pv_forecast_kwh=pv, load_forecast_kwh=[0.4]*24, outage_forecast=[0]*17+[1,1,1]+[0]*4)
r = c.post("/plan", json=body); print(r.status_code, r.json()["summary"])
print(c.post("/plan", json=dict(body, profile="nope")).status_code, c.post("/plan", json=dict(body, load_forecast_kwh=[0.4]*5)).status_code)
# high-level endpoint used by the frontend
demo = dict(profile="balanced", soc_pct=25, start_hour=15, battery_kwh=5, pv_kwp=3.1, daily_kwh=9, month=10,
            buy_lkr_per_kwh=45, sell_lkr_per_kwh=28,
            weather=[dict(start_in_hours=0, duration_hours=3, condition="rainy")],
            outages=[dict(start_in_hours=4, duration_hours=5)])
r = c.post("/plan/auto", json=demo); j = r.json(); print(r.status_code, j["notes"])
print({k: (v["unserved_critical_kwh"], v["hours_lost"]) for k, v in j["comparison"].items()})
print(c.post("/plan/auto", json=dict(demo, profile="x")).status_code,
      c.post("/plan/auto", json=dict(demo, weather=[dict(start_in_hours=0, duration_hours=2, condition="snow")])).status_code,
      c.post("/plan/auto", json=dict(demo, soc_pct=120)).status_code)
e = c.get("/evaluation"); print(e.status_code, len(e.json()["controllers"]), len(e.json()["reserve_rules"]))

# ---- live forecast (Open-Meteo) ----  uses a fake forecast so the test needs no internet
import numpy as np, pandas as pd, pvlib
from datetime import datetime
sys.path.insert(0, "src")
import weather as wx


def fake_open_meteo(lat=5.974, lon=80.43, rain_hours=(), days=3):
    """Same JSON shape as Open-Meteo, built from a clear-sky model (values are the mean of the preceding hour)."""
    idx = pd.date_range(pd.Timestamp(datetime.now()).normalize(), periods=24 * days, freq="1h")
    cs = pvlib.location.Location(lat, lon, tz="Asia/Colombo").get_clearsky((idx - pd.Timedelta(minutes=30)).tz_localize("Asia/Colombo"))
    ghi, dni, dhi = (cs[k].to_numpy() * 0.9 for k in ("ghi", "dni", "dhi"))
    rain, cloud = np.zeros(len(idx)), np.full(len(idx), 15.0)
    for i, ts in enumerate(idx):
        if ts.hour in rain_hours:
            ghi[i] *= 0.15; dni[i] *= 0.05; dhi[i] *= 0.5; rain[i] = 2.0; cloud[i] = 95.0
    return {"hourly": {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in idx], "temperature_2m": [28.0] * len(idx),
                       "cloud_cover": cloud.tolist(), "precipitation": rain.tolist(), "shortwave_radiation": ghi.tolist(),
                       "direct_normal_irradiance": dni.tolist(), "diffuse_radiation": dhi.tolist(), "wind_speed_10m": [2.0] * len(idx)}}


wx.fetch_raw = lambda lat, lon, *a, **k: fake_open_meteo(lat, lon)
r = c.get("/weather/forecast?lat=5.974&lon=80.43&start_hour=8"); f = r.json()
print(r.status_code, f["source"], len(f["hours"]), "solar per kWp over 24 h:", round(sum(h["pv_kwh_per_kwp"] for h in f["hours"]), 2))
assert r.status_code == 200 and len(f["hours"]) == 24 and 4.0 < sum(h["pv_kwh_per_kwp"] for h in f["hours"]) < 6.0
r = c.post("/plan/auto", json=dict(demo, use_forecast=True, weather=[])); j = r.json()
print(r.status_code, j["weather_source"], j["notes"][:2], len(j["forecast_hours"]))
assert r.status_code == 200 and j["weather_source"] == "open-meteo"
wx.fetch_raw = lambda lat, lon, *a, **k: fake_open_meteo(lat, lon, rain_hours=range(0, 24))   # rain all day
rain = c.post("/plan/auto", json=dict(demo, use_forecast=True, weather=[])).json()
assert sum(rain["pv_forecast_kwh"]) < sum(j["pv_forecast_kwh"]) * 0.5, "rain should cut solar a lot"
print("rainy forecast solar", round(sum(rain["pv_forecast_kwh"]), 2), "vs clear", round(sum(j["pv_forecast_kwh"]), 2))


def broken(*a, **k):
    raise wx.ForecastError("could not reach Open-Meteo (test)")


wx.fetch_raw = broken
r = c.post("/plan/auto", json=dict(demo, use_forecast=True)); j = r.json()
print("fallback:", r.status_code, j["weather_source"], j["notes"][0][:60])
assert r.status_code == 200 and j["weather_source"] == "typical" and "unavailable" in " ".join(j["notes"])
print("forecast endpoint when broken:", c.get("/weather/forecast").status_code)
assert c.get("/weather/forecast").status_code == 502
print("ALL FORECAST TESTS PASSED")
