from fastapi import APIRouter

router = APIRouter(tags=["solarsetup"])


@router.get("")
def solarsetup() -> dict[str, str]:
    return {"feature": "solarsetup", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "solarsetup", "status": "ok"}
