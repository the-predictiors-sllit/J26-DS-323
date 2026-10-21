"""Energy Resilience API: hourly battery plan for a solar home that prepares for scheduled power cuts.
Registered in app/main.py with the prefix /api/v1/energyresilience."""
import copy
import csv
from typing import List, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .engine import weather as wx
from .engine.data_loader import ASSETS, load_config
from .engine.plan import get_plan
from .engine.planner import WEATHER_FACTOR, plan_for_user

router = APIRouter(tags=["energyresilience"])
CFG = load_config()


@router.get("")
def energyresilience() -> dict[str, str]:
    return {"feature": "energyresilience", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "energyresilience", "status": "ok"}


@router.get("/profiles")
def profiles():
    """The preference options the frontend can offer."""
    return {k: v for k, v in CFG["profiles"].items()}


class PlanRequest(BaseModel):
    profile: str = Field("balanced", description="savings, balanced or resilience")
    buy_lkr_per_kwh: Union[float, List[float]] = Field(35.0, description="Price to buy from the grid, one number or one per hour")
    sell_lkr_per_kwh: Union[float, List[float]] = Field(22.0, description="Price paid for export, one number or one per hour")
    soc_pct: float = Field(50.0, ge=0, le=100, description="Current battery level in percent")
    pv_forecast_kwh: List[float] = Field(..., description="Expected solar energy per hour (kWh), normally 24 values")
    load_forecast_kwh: List[float] = Field(..., description="Expected home use per hour (kWh), same length")
    outage_forecast: List[int] = Field(..., description="1 where the grid is down, else 0, same length")


@router.post("/plan")
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
    use_forecast: bool = Field(False, description="Use the live Open-Meteo forecast instead of a typical day")
    lat: float = Field(5.974, ge=-90, le=90)
    lon: float = Field(80.43, ge=-180, le=180)


def _pv_cfg_one_kwp(lat, lon):
    c = copy.deepcopy(CFG["pv"])
    c["lat"], c["lon"] = lat, lon
    return c


@router.get("/weather/forecast")
def weather_forecast(lat: float = 5.974, lon: float = 80.43, start_hour: int = 8):
    """Live 24-hour weather and solar forecast from Open-Meteo for the chosen place."""
    try:
        return wx.get_forecast(lat, lon, start_hour, _pv_cfg_one_kwp(lat, lon))
    except wx.ForecastError as e:
        raise HTTPException(status_code=502, detail=f"Live forecast unavailable: {e}")


@router.post("/plan/auto")
def plan_auto(req: AutoPlanRequest):
    """One call for the whole app: plan for the next 24 hours plus a comparison with two ordinary battery rules."""
    try:
        for w in req.weather:
            if w.condition not in WEATHER_FACTOR:
                raise ValueError(f"weather condition must be one of {list(WEATHER_FACTOR)}")
        month, weekend, pv_per_kwp, source = req.month, req.is_weekend, None, None
        if req.use_forecast:
            try:
                f = wx.get_forecast(req.lat, req.lon, req.start_hour, _pv_cfg_one_kwp(req.lat, req.lon))
                month, weekend = f["month"], f["is_weekend"]
                pv_per_kwp = [h["pv_kwh_per_kwp"] for h in f["hours"]]
                source = "Solar forecast: live Open-Meteo forecast for your location."
            except wx.ForecastError as e:
                source = f"Live forecast unavailable ({e}). A typical day for this month was used instead."
        res = plan_for_user(req.profile, req.buy_lkr_per_kwh, req.sell_lkr_per_kwh, req.soc_pct, req.battery_kwh,
                            req.pv_kwp, req.daily_kwh, month, req.start_hour, weekend,
                            [w.model_dump() for w in req.weather], [o.model_dump() for o in req.outages], CFG,
                            pv_per_kwp=pv_per_kwp, solar_source=source)
        if req.use_forecast and pv_per_kwp is not None:
            res["forecast_hours"] = f["hours"]
        return res
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


def _read_csv(name):
    path = ASSETS / name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{name} not found in the energyresilience assets folder")
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k, v in r.items():
            try:
                r[k] = float(v)
            except (TypeError, ValueError):
                pass
    return rows


@router.get("/evaluation")
def evaluation():
    """One-year simulated results (3 outage scenarios x 2 homes) used by the Compare and History pages."""
    return {"controllers": _read_csv("evaluation_summary.csv"), "reserve_rules": _read_csv("rule_reserve_baselines.csv")}
