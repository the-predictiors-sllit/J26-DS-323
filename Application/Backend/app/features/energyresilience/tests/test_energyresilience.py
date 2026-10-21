"""Tests for the Energy Resilience router. The live forecast is faked, so no internet is needed.
Run from Application/Backend:  python -m pytest app/features/energyresilience/tests -q"""
from datetime import datetime

import numpy as np
import pandas as pd
import pvlib
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.features.energyresilience.engine import weather as wx
from app.features.energyresilience.router import router

app = FastAPI()
app.include_router(router, prefix="/api/v1/energyresilience")
client = TestClient(app)
P = "/api/v1/energyresilience"

DEMO = dict(profile="balanced", soc_pct=25, start_hour=15, battery_kwh=5, pv_kwp=3.1, daily_kwh=9, month=10,
            buy_lkr_per_kwh=45, sell_lkr_per_kwh=28,
            weather=[dict(start_in_hours=0, duration_hours=3, condition="rainy")],
            outages=[dict(start_in_hours=4, duration_hours=5)])


def fake_open_meteo(lat=5.974, lon=80.43, rain_hours=(), days=3):
    idx = pd.date_range(pd.Timestamp(datetime.now()).normalize(), periods=24 * days, freq="1h")
    cs = pvlib.location.Location(lat, lon, tz="Asia/Colombo").get_clearsky(
        (idx - pd.Timedelta(minutes=30)).tz_localize("Asia/Colombo"))
    ghi, dni, dhi = (cs[k].to_numpy() * 0.9 for k in ("ghi", "dni", "dhi"))
    rain, cloud = np.zeros(len(idx)), np.full(len(idx), 15.0)
    for i, ts in enumerate(idx):
        if ts.hour in rain_hours:
            ghi[i] *= 0.15; dni[i] *= 0.05; dhi[i] *= 0.5; rain[i] = 2.0; cloud[i] = 95.0
    return {"hourly": {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in idx], "temperature_2m": [28.0] * len(idx),
                       "cloud_cover": cloud.tolist(), "precipitation": rain.tolist(), "shortwave_radiation": ghi.tolist(),
                       "direct_normal_irradiance": dni.tolist(), "diffuse_radiation": dhi.tolist(),
                       "wind_speed_10m": [2.0] * len(idx)}}


def test_leader_routes_still_work():
    assert client.get(P).json() == {"feature": "energyresilience", "status": "available"}
    assert client.get(P + "/health").json() == {"feature": "energyresilience", "status": "ok"}


def test_profiles_and_plan():
    assert set(client.get(P + "/profiles").json()) == {"savings", "balanced", "resilience"}
    pv = [0] * 6 + [0.1, 0.4, 0.8, 1.2, 1.5, 1.7, 1.6, 1.4, 1.0, 0.6, 0.2] + [0] * 7
    body = dict(profile="resilience", soc_pct=50, pv_forecast_kwh=pv, load_forecast_kwh=[0.4] * 24,
                outage_forecast=[0] * 17 + [1, 1, 1] + [0] * 4)
    r = client.post(P + "/plan", json=body)
    assert r.status_code == 200 and len(r.json()["hours"]) == 24
    assert client.post(P + "/plan", json=dict(body, profile="nope")).status_code == 422
    assert client.post(P + "/plan", json=dict(body, load_forecast_kwh=[0.4] * 5)).status_code == 422


def test_plan_auto_and_validation():
    r = client.post(P + "/plan/auto", json=DEMO)
    j = r.json()
    assert r.status_code == 200 and j["weather_source"] == "typical"
    assert j["comparison"]["mpc"]["unserved_critical_kwh"] <= j["comparison"]["plain_rule"]["unserved_critical_kwh"]
    assert client.post(P + "/plan/auto", json=dict(DEMO, profile="x")).status_code == 422
    assert client.post(P + "/plan/auto", json=dict(
        DEMO, weather=[dict(start_in_hours=0, duration_hours=2, condition="snow")])).status_code == 422
    assert client.post(P + "/plan/auto", json=dict(DEMO, soc_pct=120)).status_code == 422


def test_evaluation_results():
    e = client.get(P + "/evaluation").json()
    assert len(e["controllers"]) > 0 and len(e["reserve_rules"]) > 0


def test_live_forecast_and_fallback(monkeypatch):
    monkeypatch.setattr(wx, "fetch_raw", lambda lat, lon, *a, **k: fake_open_meteo(lat, lon))
    f = client.get(P + "/weather/forecast?lat=5.974&lon=80.43&start_hour=8").json()
    assert len(f["hours"]) == 24 and 4.0 < sum(h["pv_kwh_per_kwp"] for h in f["hours"]) < 6.0
    j = client.post(P + "/plan/auto", json=dict(DEMO, use_forecast=True, weather=[])).json()
    assert j["weather_source"] == "open-meteo" and len(j["forecast_hours"]) == 24

    monkeypatch.setattr(wx, "fetch_raw", lambda lat, lon, *a, **k: fake_open_meteo(lat, lon, rain_hours=range(24)))
    rain = client.post(P + "/plan/auto", json=dict(DEMO, use_forecast=True, weather=[])).json()
    assert sum(rain["pv_forecast_kwh"]) < sum(j["pv_forecast_kwh"]) * 0.5

    def broken(*a, **k):
        raise wx.ForecastError("could not reach Open-Meteo (test)")

    monkeypatch.setattr(wx, "fetch_raw", broken)
    j = client.post(P + "/plan/auto", json=dict(DEMO, use_forecast=True)).json()
    assert j["weather_source"] == "typical" and "unavailable" in " ".join(j["notes"])
    assert client.get(P + "/weather/forecast").status_code == 502
