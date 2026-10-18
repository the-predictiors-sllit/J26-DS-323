from typing import Any, Dict

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from . import service
from .schemas import PredictionResponse, ReportRequest

router = APIRouter(tags=["panelhealth"])


@router.get("")
def panelhealth() -> dict[str, str]:
    return {"feature": "panelhealth", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "panelhealth", "status": "ok"}


@router.get("/model-status")
def model_status() -> dict[str, bool]:
    """Is a trained model saved where the service looks for it, and are the image packages installed?"""
    return {"model_available": service.model_available(), "packages_installed": service.packages_installed()}


@router.post("/crop")
async def crop(file: UploadFile = File(...), corners: str = Form(...), size: int = Form(448)) -> Response:
    """The straightened panel as a JPEG, for the user to check before the analysis runs."""
    data = await file.read()
    jpeg = await run_in_threadpool(service.crop_jpeg, data, corners, size)
    return Response(content=jpeg, media_type="image/jpeg")


@router.post("/predict", response_model=PredictionResponse)
async def predict(
    file: UploadFile = File(...),
    corners: str = Form(...),
    rated_capacity_w: float = Form(...),
    age_years: float = Form(...),
    explain: bool = Form(True),
) -> Dict[str, Any]:
    """Health score, category, advice and watt range for one photo."""
    data = await file.read()
    return await run_in_threadpool(service.predict_report, data, corners, rated_capacity_w, age_years, explain)


@router.post("/report")
async def report(req: ReportRequest, request: Request) -> Response:
    """The analysis as a PDF. The page sends the result it already has; nothing is stored on the server."""
    if int(request.headers.get("content-length") or 0) > 12 * 1024 * 1024:
        raise HTTPException(413, "That request is too large.")
    pdf, filename = await run_in_threadpool(service.make_report, req)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})
