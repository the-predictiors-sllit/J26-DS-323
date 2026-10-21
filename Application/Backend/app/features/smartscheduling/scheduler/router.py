from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Lock
from time import monotonic
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status

from .schemas import SchedulerRequest
from .service import generate_schedule

router = APIRouter(prefix="/scheduler", tags=["scheduler"])
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="solar-scheduler")
_lock = Lock()
_jobs: dict[str, dict] = {}
TTL_SECONDS = 3600


def _purge():
    for key in list(_jobs):
        if (
            _jobs[key]["status"] in ("completed", "failed")
            and monotonic() - _jobs[key]["updated"] > TTL_SECONDS
        ):
            del _jobs[key]


def _work(job_id: str, request: SchedulerRequest):
    def update(progress: int, message: str):
        with _lock:
            _jobs[job_id].update(
                status="running",
                progress=progress,
                message=message,
                updated=monotonic(),
            )

    try:
        update(0, "Starting forecast and optimization")
        result = generate_schedule(request, update)
        with _lock:
            _jobs[job_id].update(
                status="completed", progress=100, result=result, updated=monotonic()
            )
    except FileNotFoundError:
        with _lock:
            _jobs[job_id].update(
                status="failed",
                error=f"The {request.prediction_model_minutes}-minute solar model or metadata is missing.",
                updated=monotonic(),
            )
    except Exception as exc:
        # Job failures are returned as data, so the frontend can stop polling.
        with _lock:
            _jobs[job_id].update(
                status="failed", error=str(exc)[:1000], updated=monotonic()
            )


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
def create_schedule(request: SchedulerRequest):
    with _lock:
        _purge()
        if sum(job["status"] in ("queued", "running") for job in _jobs.values()) >= 3:
            raise HTTPException(
                503, "The scheduler is busy. Try again after an existing job finishes."
            )
        # Retain at most 12 results, evicting the oldest terminal job first.
        while len(_jobs) >= 12:
            terminal = [
                key
                for key, value in _jobs.items()
                if value["status"] in ("completed", "failed")
            ]
            if not terminal:
                raise HTTPException(503, "The scheduler is busy.")
            del _jobs[min(terminal, key=lambda key: _jobs[key]["updated"])]
        job_id = str(uuid4())
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Queued",
            "updated": monotonic(),
        }
    _executor.submit(_work, job_id, request)
    return {"job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def schedule_status(job_id: UUID):
    with _lock:
        _purge()
        job = _jobs.get(str(job_id))
        if job is None:
            raise HTTPException(
                404, "Schedule not found. It may have expired or the backend restarted."
            )
        return deepcopy({key: value for key, value in job.items() if key != "updated"})
