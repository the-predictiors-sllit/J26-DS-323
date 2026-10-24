from uuid import UUID

from fastapi import APIRouter, status

from .jobs import get_schedule, submit_schedule
from .schemas import SchedulerRequest

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
def create_schedule(request: SchedulerRequest):
    return submit_schedule(request)


@router.get("/jobs/{job_id}")
def schedule_status(job_id: UUID):
    return get_schedule(job_id)
