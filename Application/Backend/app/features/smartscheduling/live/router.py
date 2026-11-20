from fastapi import APIRouter, HTTPException
from .providers import ProviderUnavailable, get_live_provider
from .schemas import AssessmentRequest
from .service import latest_reading, preview_assessment

router = APIRouter(prefix="/live", tags=["live solar monitoring"])


@router.get("/status")
def status():
    provider = get_live_provider()
    return {"provider": provider.name, "provider_implemented": provider.is_implemented(),
            "connection_verified": False, "automatic_monitoring_available": False,
            "automatic_rescheduling_available": False, "appliance_control_available": False}


@router.get("/measurement")
def measurement():
    try:
        return latest_reading(get_live_provider())
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/assess")
def assess(request: AssessmentRequest):
    try:
        return preview_assessment(get_live_provider(), request)
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
