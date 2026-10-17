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
