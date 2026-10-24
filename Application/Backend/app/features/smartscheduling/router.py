"""Compose solar prediction and MILP routes with existing public API paths."""

from fastapi import APIRouter

from .milp.router import router as milp_router
from .solar_prediction.router import router as solar_prediction_router

router = APIRouter(tags=["smartscheduling"])
router.include_router(milp_router)


@router.get("")
def smartscheduling():
    return {"feature": "smartscheduling", "status": "available"}


@router.get("/health")
def health_check():
    return {"feature": "smartscheduling", "status": "ok"}



router.include_router(solar_prediction_router)
