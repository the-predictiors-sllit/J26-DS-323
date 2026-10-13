from fastapi import APIRouter

router = APIRouter(tags=["smartscheduling"])


@router.get("")
def smartscheduling() -> dict[str, str]:
    return {"feature": "smartscheduling", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "smartscheduling", "status": "ok"}
