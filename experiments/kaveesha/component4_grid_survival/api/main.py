"""FastAPI wrapper for Component 4. Run from the project folder:
    uvicorn api.main:app --reload
Then open http://127.0.0.1:8000/docs to try it."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import csv
from typing import List, Optional, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from data_loader import load_config
from plan import get_plan
from planner import plan_for_user, WEATHER_FACTOR

app = FastAPI(title="Grid-Survival Optimizer", version="0.2",
              description="Hourly battery plan for a solar home that anticipates scheduled power cuts.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
CFG = load_config()


class PlanRequest(BaseModel):
    profile: str = Field("balanced", description="savings, balanced or resilience")
    buy_lkr_per_kwh: Union[float, List[float]] = Field(35.0, description="Price to buy from the grid, one number or one per hour")
    sell_lkr_per_kwh: Union[float, List[float]] = Field(22.0, description="Price paid for export, one number or one per hour")
    soc_pct: float = Field(50.0, ge=0, le=100, description="Current battery level in percent")
    pv_forecast_kwh: List[float] = Field(..., description="Expected solar energy per hour (kWh), normally 24 values")
    load_forecast_kwh: List[float] = Field(..., description="Expected home use per hour (kWh), same length")
    outage_forecast: List[int] = Field(..., description="1 where the grid is down, else 0, same length")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/profiles")
def profiles():
    """The preference options the frontend can offer."""
    return {k: v for k, v in CFG["profiles"].items()}


@app.post("/plan")
def plan(req: PlanRequest):
    try:
        return get_plan(req.profile, req.buy_lkr_per_kwh, req.sell_lkr_per_kwh, req.soc_pct,
                        req.pv_forecast_kwh, req.load_forecast_kwh, req.outage_forecast, CFG)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


class Event(BaseModel):
    start_in_hours: int = Field(0, ge=0, le=23, description="0 = starts now, 3 = starts in 3 hours")
    duration_hours: int = Field(1, ge=1, le=24)


class WeatherEvent(Event):
    condition: str = Field("rainy", description="sunny, cloudy or rainy")


class AutoPlanRequest(BaseModel):
    """Simple inputs from the app. The server builds the solar, home-use and outage forecasts itself."""
    profile: str = "balanced"
    buy_lkr_per_kwh: float = 35.0
    sell_lkr_per_kwh: float = 22.0
    soc_pct: float = Field(60.0, ge=0, le=100)
    battery_kwh: float = Field(5.0, ge=1, le=30)
    pv_kwp: float = Field(3.1, ge=0.5, le=30)
    daily_kwh: float = Field(9.0, ge=1, le=80, description="Typical home electricity use per day")
    month: int = Field(10, ge=1, le=12)
    start_hour: int = Field(8, ge=0, le=23, description="Current hour of the day (0-23)")
    is_weekend: bool = False
    weather: List[WeatherEvent] = []
    outages: List[Event] = []


@app.post("/plan/auto")
def plan_auto(req: AutoPlanRequest):
    """One call for the whole app: plan for the next 24 hours plus a comparison with two ordinary battery rules."""
    try:
        for w in req.weather:
            if w.condition not in WEATHER_FACTOR:
                raise ValueError(f"weather condition must be one of {list(WEATHER_FACTOR)}")
        return plan_for_user(req.profile, req.buy_lkr_per_kwh, req.sell_lkr_per_kwh, req.soc_pct, req.battery_kwh,
                             req.pv_kwp, req.daily_kwh, req.month, req.start_hour, req.is_weekend,
                             [w.model_dump() for w in req.weather], [o.model_dump() for o in req.outages], CFG)
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


def _read_csv(name):
    path = Path(__file__).resolve().parents[1] / "results" / name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{name} not found - run python src/evaluate.py 365")
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k, v in r.items():
            try:
                r[k] = float(v)
            except (TypeError, ValueError):
                pass
    return rows


@app.get("/evaluation")
def evaluation():
    """One-year simulated results (3 outage scenarios x 2 homes) used by the Compare and History pages."""
    return {"controllers": _read_csv("evaluation_summary.csv"), "reserve_rules": _read_csv("rule_reserve_baselines.csv")}
