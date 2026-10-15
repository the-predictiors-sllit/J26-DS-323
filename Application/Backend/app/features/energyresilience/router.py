from fastapi import APIRouter

router = APIRouter(tags=["energyresilience"])


@router.get("")
def energyresilience() -> dict[str, str]:
    return {"feature": "energyresilience", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "energyresilience", "status": "ok"}
