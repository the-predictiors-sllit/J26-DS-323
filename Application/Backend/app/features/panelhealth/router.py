from fastapi import APIRouter

router = APIRouter(tags=["panelhealth"])


@router.get("")
def panelhealth() -> dict[str, str]:
    return {"feature": "panelhealth", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "panelhealth", "status": "ok"}
