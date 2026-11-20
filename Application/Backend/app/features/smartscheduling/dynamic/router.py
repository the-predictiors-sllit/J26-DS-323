from datetime import date, datetime
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import Field

from ..milp.schemas import Appliance, InputModel
from ..solar_prediction.weather import OpenMeteoError
from .service import available_dates, configured_source, replay

router = APIRouter(prefix="/dynamic-replay", tags=["dynamic replay"])


class PlanSlot(InputModel):
    timestamp: datetime
    solar_kw: float = Field(ge=0)


class PlanStart(InputModel):
    appliance_id: str
    start: datetime


class InitialPlan(InputModel):
    slots: list[PlanSlot] = Field(min_length=52, max_length=52)
    schedule: list[PlanStart] = Field(max_length=30)


class ReplayRequest(InputModel):
    day: date
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    pv_capacity_kwp: float = Field(gt=0, le=1000)
    solar_safety_factor: float = Field(default=0.9, gt=0, le=1)
    background_load_kw: float = Field(default=0, ge=0)
    max_household_power_kw: float | None = Field(default=None, gt=0)
    threshold_kw: float = Field(default=0.3, gt=0)
    threshold_ratio: float = Field(default=0.2, gt=0, le=1)
    apply_rescheduling: bool = True
    detection_method: Literal["latest", "recent_average", "recent_average_60"] = "latest"
    initial_plan: InitialPlan | None = None
    appliances: list[Appliance] = Field(min_length=1, max_length=30)


@router.get("/dates")
def dates():
    try:
        return {"dates": available_dates(configured_source())}
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f"Cannot read configured historical CSV: {exc}") from exc


@router.post("/run")
def run(request: ReplayRequest):
    if len({item.id for item in request.appliances}) != len(request.appliances):
        raise HTTPException(status_code=422, detail="Appliance IDs must be unique.")
    try:
        return replay(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Historical CSV or 5-minute prediction model is not installed.") from exc
    except OpenMeteoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
