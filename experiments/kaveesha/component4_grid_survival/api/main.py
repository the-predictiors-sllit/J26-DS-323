"""FastAPI wrapper for Component 4. Run from the project folder:
    uvicorn api.main:app --reload
Then open http://127.0.0.1:8000/docs to try it."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from typing import List, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from data_loader import load_config
from plan import get_plan

app = FastAPI(title="Grid-Survival Optimizer", version="0.1",
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
