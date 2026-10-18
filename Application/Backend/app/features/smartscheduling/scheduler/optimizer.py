"""Solar-only, noninterruptible appliance-job scheduling with Pyomo + HiGHS."""
from __future__ import annotations

from dataclasses import dataclass
import math
import time

import numpy as np
import pandas as pd
import pyomo.environ as pyo
from pyomo.contrib.appsi.solvers import Highs
from pyomo.contrib.appsi.base import TerminationCondition


@dataclass(frozen=True)
class ApplianceJob:
    job_id: str
    power_kw: float
    duration_minutes: int
    earliest_start: str
    latest_finish: str
    preferred_start: str
    priority: int = 1


def minute(clock: str) -> int:
    parts = clock.split(":")
    if len(parts) != 2 or any(not part.isdigit() for part in parts):
        raise ValueError(f"Invalid HH:MM time: {clock}")
    hour, minutes = map(int, parts)
    if not (0 <= hour <= 23 and 0 <= minutes <= 59):
        raise ValueError(f"Invalid HH:MM time: {clock}")
    return hour * 60 + minutes


def prepare(solar: pd.DataFrame, jobs: list[ApplianceJob], interval_minutes: int, safety_factor: float, household_limit_kw: float | None):
    if interval_minutes not in (5, 15, 60):
        raise ValueError("Use 5-, 15-, or 60-minute slots.")
    if not math.isfinite(safety_factor) or not 0 < safety_factor <= 1:
        raise ValueError("safety_factor must be in (0, 1].")
    if household_limit_kw is not None and (not math.isfinite(household_limit_kw) or household_limit_kw <= 0):
        raise ValueError("The optional household limit must be positive.")
    if not jobs or len({job.job_id for job in jobs}) != len(jobs):
        raise ValueError("Provide jobs with nonempty, unique IDs.")
    frame = solar.copy()
    if not {"timestamp", "solar_kw"}.issubset(frame.columns) or frame.empty:
        raise ValueError("Provide timestamp and solar_kw columns with at least one slot.")
    times = pd.to_datetime(frame["timestamp"], utc=True, errors="raise").dt.tz_convert("Asia/Colombo")
    # Explicit offsets are required so naive UTC parsing cannot shift the schedule.
    if any(pd.Timestamp(value).tzinfo is None for value in frame["timestamp"]):
        raise ValueError("Solar timestamps must include a timezone offset.")
    if times.dt.normalize().nunique() != 1 or times.duplicated().any():
        raise ValueError("First experiment accepts one day with unique timestamps.")
    expected = pd.Timedelta(minutes=interval_minutes)
    if len(times) > 1 and not times.diff().iloc[1:].eq(expected).all():
        raise ValueError("Slots must be sorted, complete, and uniformly spaced.")
    if (times.dt.second != 0).any() or (times.dt.microsecond != 0).any() or (times.dt.minute % interval_minutes != 0).any():
        raise ValueError("Timestamps must align to interval boundaries.")
    start_minutes = (times.dt.hour * 60 + times.dt.minute).to_numpy()
    if start_minutes[0] < 360 or start_minutes[-1] + interval_minutes > 1140:
        raise ValueError("Slots must fit completely within 06:00–19:00.")
    frame["timestamp"] = times.map(lambda value: value.isoformat())
    if "base_load_kw" not in frame:
        frame["base_load_kw"] = 0.0
    for column in ("solar_kw", "base_load_kw"):
        frame[column] = pd.to_numeric(frame[column], errors="raise")
        if not np.isfinite(frame[column]).all() or (frame[column] < 0).any():
            raise ValueError(f"{column} must contain finite nonnegative power values.")
    frame["usable_solar_kw"] = frame["solar_kw"] * safety_factor
    candidates: dict[str, list[int]] = {}
    durations = {}
    for job in jobs:
        if not job.job_id or not math.isfinite(job.power_kw) or job.power_kw <= 0:
            raise ValueError("Jobs need an ID and finite positive power.")
        if job.duration_minutes <= 0 or job.duration_minutes % interval_minutes:
            raise ValueError(f"{job.job_id}: duration must be a positive multiple of the interval.")
        if not isinstance(job.priority, int) or job.priority < 1:
            raise ValueError("Priority must be a positive integer.")
        release, deadline, preferred = map(minute, (job.earliest_start, job.latest_finish, job.preferred_start))
        if not 360 <= release < deadline <= 1140 or not release <= preferred <= deadline - job.duration_minutes:
            raise ValueError(f"{job.job_id}: invalid availability window or preferred start.")
        duration = int(job.duration_minutes // interval_minutes)
        durations[job.job_id] = duration
        candidates[job.job_id] = [
            slot for slot in range(len(frame) - duration + 1)
            if start_minutes[slot] >= release and start_minutes[slot] + job.duration_minutes <= deadline
        ]
    return frame.reset_index(drop=True), start_minutes, candidates, durations


def evaluate_schedule(frame: pd.DataFrame, jobs: list[ApplianceJob], starts: dict[str, int], interval_minutes: int, *, household_limit_kw: float | None = None):
    """Independent power, energy, deadline and solar-only constraint checks."""
    load = frame["base_load_kw"].to_numpy(dtype=float).copy()
    violations = []
    schedule = []
    weighted_shift = 0.0
    timestamps = pd.to_datetime(frame["timestamp"], utc=True).dt.tz_convert("Asia/Colombo")
    for job in jobs:
        start = starts.get(job.job_id)
        duration = job.duration_minutes // interval_minutes
        if start is None:
            violations.append(f"Missing job: {job.job_id}")
            continue
        if start < 0 or start + duration > len(frame):
            violations.append(f"Out-of-horizon job: {job.job_id}")
            continue
        stamp = timestamps.iloc[start]
        finish = stamp + pd.Timedelta(minutes=job.duration_minutes)
        start_minute = stamp.hour * 60 + stamp.minute
        finish_minute = finish.hour * 60 + finish.minute
        if start_minute < minute(job.earliest_start) or finish_minute > minute(job.latest_finish):
            violations.append(f"Availability violation: {job.job_id}")
        weighted_shift += job.priority * abs(start_minute - minute(job.preferred_start))
        load[start:start + duration] += job.power_kw
        schedule.append({"job_id": job.job_id, "start": stamp.isoformat(), "finish_exclusive": finish.isoformat(), "power_kw": job.power_kw, "duration_minutes": job.duration_minutes, "energy_kwh": job.power_kw * job.duration_minutes / 60})
    available = frame["usable_solar_kw"].to_numpy(dtype=float)
    deficit = np.maximum(load - available, 0)
    overloaded = int(np.count_nonzero(deficit > 1e-6))
    if overloaded:
        violations.append(f"Solar limit exceeded in {overloaded} slots")
    if household_limit_kw is not None and (load > household_limit_kw + 1e-6).any():
        violations.append("Household limit exceeded")
    step_hours = interval_minutes / 60
    solar_energy = float(frame["solar_kw"].sum() * step_hours)
    actual_solar_used = float(np.minimum(load, available).sum() * step_hours)
    trace = frame.copy()
    trace["scheduled_total_kw"] = load
    trace["solar_deficit_kw"] = deficit
    trace["unused_usable_solar_kw"] = np.maximum(available - load, 0)
    return {
        "valid": not violations, "violations": violations,
        "completed_jobs": len(schedule), "required_jobs": len(jobs),
        "weighted_start_shift_minutes": weighted_shift,
        "peak_load_kw": float(load.max()),
        "load_energy_kwh": float(load.sum() * step_hours),
        "solar_energy_kwh": solar_energy,
        "solar_used_kwh": actual_solar_used,
        "solar_utilization_pct": 100 * actual_solar_used / solar_energy if solar_energy else 0,
        "hypothetical_grid_deficit_kwh": float(deficit.sum() * step_hours),
        "solar_violating_slots": overloaded,
        "schedule": schedule, "trace": trace,
    }


def solve_solar_only(solar: pd.DataFrame, jobs: list[ApplianceJob], *, interval_minutes=15, safety_factor=0.9, household_limit_kw=None, time_limit_seconds=30):
    """Lexicographic objective: preserve preferred starts, then reduce peak load.

    Every job is mandatory and noninterruptible. There is no battery, grid,
    export credit, tariff, or load-dropping variable. Two solves avoid mixing
    incomparable objective units with an arbitrary penalty coefficient.
    """
    frame, start_minutes, candidates, durations = prepare(solar, jobs, interval_minutes, safety_factor, household_limit_kw)
    start_clock = time.perf_counter()
    missing = [job.job_id for job in jobs if not candidates[job.job_id]]
    if missing:
        return {"status": "infeasible", "reason": f"No time window long enough for {missing}", "solve_seconds": 0}
    if (frame.base_load_kw > frame.usable_solar_kw + 1e-9).any():
        return {"status": "infeasible", "reason": "Background load alone exceeds usable solar in at least one slot.", "solve_seconds": 0}

    job_by_id = {job.job_id: job for job in jobs}
    model = pyo.ConcreteModel()
    pairs = [(job.job_id, start) for job in jobs for start in candidates[job.job_id]]
    model.starts = pyo.Set(dimen=2, initialize=pairs)
    model.choose = pyo.Var(model.starts, domain=pyo.Binary)
    model.once = pyo.ConstraintList()
    for job in jobs:
        model.once.add(sum(model.choose[job.job_id, start] for start in candidates[job.job_id]) == 1)
    # Start variables imply contiguous running; a job cannot be split or paused.
    model.total_load = pyo.Expression(range(len(frame)), rule=lambda m, slot:
        float(frame.base_load_kw.iloc[slot]) + sum(job_by_id[job_id].power_kw * m.choose[job_id, start] for job_id, start in pairs if start <= slot < start + durations[job_id]))
    model.solar_limit = pyo.Constraint(range(len(frame)), rule=lambda m, slot: m.total_load[slot] <= float(frame.usable_solar_kw.iloc[slot]))
    if household_limit_kw is not None:
        model.household_limit = pyo.Constraint(range(len(frame)), rule=lambda m, slot: m.total_load[slot] <= household_limit_kw)
    model.peak = pyo.Var(domain=pyo.NonNegativeReals)
    model.peak_limit = pyo.Constraint(range(len(frame)), rule=lambda m, slot: model.peak >= m.total_load[slot])
    model.discomfort = pyo.Expression(expr=sum(
        job_by_id[job_id].priority * abs(int(start_minutes[start]) - minute(job_by_id[job_id].preferred_start)) * model.choose[job_id, start]
        for job_id, start in pairs))
    model.objective = pyo.Objective(expr=model.discomfort)
    solver = Highs()
    solver.config.load_solution = False
    solver.config.time_limit = time_limit_seconds
    solver.config.mip_gap = 0.0
    first = solver.solve(model)
    if first.termination_condition != TerminationCondition.optimal:
        return {"status": "infeasible" if first.termination_condition == TerminationCondition.infeasible else "not_proven_optimal", "termination": str(first.termination_condition), "solve_seconds": time.perf_counter() - start_clock}
    solver.load_vars()
    best_shift = float(pyo.value(model.discomfort))
    model.keep_primary_optimum = pyo.Constraint(expr=model.discomfort <= best_shift + 1e-6)
    model.objective.set_value(model.peak)
    second = solver.solve(model)
    if second.termination_condition != TerminationCondition.optimal:
        return {"status": "not_proven_optimal", "termination": str(second.termination_condition), "solve_seconds": time.perf_counter() - start_clock}
    solver.load_vars()
    starts = {job_id: start for job_id, start in pairs if pyo.value(model.choose[job_id, start]) > 0.5}
    evaluation = evaluate_schedule(frame, jobs, starts, interval_minutes, household_limit_kw=household_limit_kw)
    if not evaluation["valid"]:
        raise RuntimeError(f"Solver schedule failed independent validation: {evaluation['violations']}")
    return {"status": "optimal", "primary_objective": best_shift, "secondary_objective": float(pyo.value(model.peak)), "solve_seconds": time.perf_counter() - start_clock, "binary_variables": len(pairs), "starts": starts, **evaluation}

