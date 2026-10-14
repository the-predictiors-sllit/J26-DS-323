import sys; sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from api.main import app
c = TestClient(app)
print(c.get("/health").json(), list(c.get("/profiles").json()))
pv = [0]*6 + [0.1,0.4,0.8,1.2,1.5,1.7,1.6,1.4,1.0,0.6,0.2] + [0]*7
body = dict(profile="resilience", soc_pct=50, pv_forecast_kwh=pv, load_forecast_kwh=[0.4]*24, outage_forecast=[0]*17+[1,1,1]+[0]*4)
r = c.post("/plan", json=body); print(r.status_code, r.json()["summary"])
print(c.post("/plan", json=dict(body, profile="nope")).status_code, c.post("/plan", json=dict(body, load_forecast_kwh=[0.4]*5)).status_code)
