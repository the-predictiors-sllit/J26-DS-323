"""Convert start-slot decisions into schedules and per-slot simulated load."""

import pandas as pd

from ..milp.optimizer import ApplianceJob
from .optimizer import SLOT_MINUTES


def schedule_records(
    forecast: pd.DataFrame, jobs: list[ApplianceJob], names: dict[str, str], starts: dict[str, int],
) -> list[dict]:
    """Build API-friendly, timezone-aware records from a set of start indexes."""
    records = []
    for job in jobs:
        if job.job_id not in starts:
            continue
        start = forecast.timestamp.iloc[starts[job.job_id]]
        records.append({
            "appliance_id": job.job_id,
            "name": names[job.job_id],
            "start": start.isoformat(),
            "finish_exclusive": (start + pd.Timedelta(minutes=job.duration_minutes)).isoformat(),
            "power_kw": job.power_kw,
            "duration_minutes": job.duration_minutes,
            "energy_kwh": job.power_kw * job.duration_minutes / 60,
        })
    return records


def scheduled_load(jobs: list[ApplianceJob], starts: dict[str, int], slot: int, background_kw: float) -> float:
    """Sum the simulated power of appliances running in a slot plus background."""
    return background_kw + sum(
        job.power_kw for job in jobs
        if job.job_id in starts and starts[job.job_id] <= slot < starts[job.job_id] + job.duration_minutes // SLOT_MINUTES
    )
