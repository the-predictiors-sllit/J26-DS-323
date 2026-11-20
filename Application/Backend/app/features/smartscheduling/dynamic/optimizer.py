"""Reschedule pending appliance jobs using a 15-minute, solar-only MILP.

The caller provides one validated day of predictions and start-slot indexes from
an existing plan. This model is reusable by a live service once it supplies
reliable execution states; the historical replay currently infers those states.
"""
from __future__ import annotations

import pandas as pd
import pyomo.environ as pyo
from pyomo.contrib.appsi.solvers import Highs
from pyomo.contrib.appsi.base import TerminationCondition

from ..milp.optimizer import ApplianceJob, minute

SLOT_MINUTES = 15


def candidate_starts(frame: pd.DataFrame, job: ApplianceJob, first_slot: int) -> list[int]:
    """Return starts that fit the job's window and the remaining forecast."""
    earliest = minute(job.earliest_start)
    deadline = minute(job.latest_finish)
    duration_slots = job.duration_minutes // SLOT_MINUTES
    result = []
    for slot in range(first_slot, len(frame) - duration_slots + 1):
        stamp = frame.timestamp.iloc[slot]
        start_minute = stamp.hour * 60 + stamp.minute
        if start_minute >= earliest and start_minute + job.duration_minutes <= deadline:
            result.append(slot)
    return result


def fixed_load_at_slot(frame: pd.DataFrame, jobs: list[ApplianceJob], starts: dict[str, int], slot: int) -> float:
    """Reserve background power and the remaining power of jobs already started."""
    return float(frame.base_load_kw.iloc[slot]) + sum(
        job.power_kw for job in jobs
        if starts[job.job_id] <= slot < starts[job.job_id] + job.duration_minutes // SLOT_MINUTES
    )


def validate_revision(
    frame: pd.DataFrame, jobs: list[ApplianceJob], previous: dict[str, int],
    starts: dict[str, int], now: int, factor: float, limit: float | None,
    allow_partial: bool = False,
) -> list[str]:
    """Check the returned starts and power limits without Pyomo expressions."""
    errors = []
    if not set(starts) <= {job.job_id for job in jobs} or (not allow_partial and set(starts) != {job.job_id for job in jobs}):
        return ["The revised plan does not contain exactly the requested jobs."]
    for job in jobs:
        if job.job_id not in starts:
            if previous[job.job_id] < now:
                errors.append(f"{job.job_id}: an already-started job was removed.")
            continue
        start = starts[job.job_id]
        if previous[job.job_id] < now:
            if start != previous[job.job_id]:
                errors.append(f"{job.job_id}: an already-started job moved.")
        elif start not in candidate_starts(frame, job, now):
            errors.append(f"{job.job_id}: start is outside its remaining window.")
    if errors:
        return errors
    for slot in range(now, len(frame)):
        load = fixed_load_at_slot(frame, [job for job in jobs if job.job_id in starts], starts, slot)
        if load > float(frame.solar_kw.iloc[slot]) * factor + 1e-6:
            errors.append(f"Solar limit exceeded at slot {slot}.")
        if limit is not None and load > limit + 1e-6:
            errors.append(f"Household limit exceeded at slot {slot}.")
    return errors


def revise(
    frame: pd.DataFrame,
    jobs: list[ApplianceJob],
    original: dict[str, int],
    current: dict[str, int],
    now: int,
    factor: float,
    limit: float | None,
    allow_partial: bool = False,
) -> dict[str, int] | None:
    """Return revised start indexes, or None if no optimal revision is proven.

    Slots are 15 minutes. A job starting before `now` is treated as already
    started and stays fixed; one starting at `now` may still be moved. All jobs
    run once, without interruption. The caller must supply complete, aligned
    data, valid starts and durations divisible by 15 minutes.

    The objective minimizes priority-weighted movement from the original plan,
    measured in slots. Multiplying every movement by 15 would give the same
    solution, so we keep the smaller coefficients. None includes infeasible and
    solver-limit outcomes; it does not distinguish between them.
    """
    pending = [job for job in jobs if current[job.job_id] >= now]
    fixed = [job for job in jobs if current[job.job_id] < now]
    options = {job.job_id: candidate_starts(frame, job, now) for job in pending}
    if not pending or (not allow_partial and any(not starts for starts in options.values())):
        return None
    if allow_partial and not any(options.values()):
        fixed_starts = {job.job_id: current[job.job_id] for job in fixed}
        return None if validate_revision(frame, jobs, current, fixed_starts, now, factor, limit, allow_partial=True) else fixed_starts

    # Exactly one binary start is chosen for each pending appliance. A chosen
    # start implies continuous operation for the entire job duration.
    model = pyo.ConcreteModel()
    pairs = [(job.job_id, start) for job in pending for start in options[job.job_id]]
    model.P = pyo.Set(dimen=2, initialize=pairs)
    model.x = pyo.Var(model.P, domain=pyo.Binary)
    model.once = pyo.ConstraintList()
    for job in pending:
        if not options[job.job_id]:
            continue
        chosen = sum(model.x[job.job_id, start] for start in options[job.job_id])
        model.once.add(chosen <= 1 if allow_partial else chosen == 1)

    by_id = {job.job_id: job for job in jobs}
    model.limits = pyo.ConstraintList()
    for slot in range(now, len(frame)):
        base = fixed_load_at_slot(frame, fixed, current, slot)
        running_options = [
            (job_id, start) for job_id, start in pairs
            if start <= slot < start + by_id[job_id].duration_minutes // SLOT_MINUTES
        ]
        usable_solar = float(frame.solar_kw.iloc[slot]) * factor
        # Moving future jobs cannot fix a deficit caused by a job already running.
        if base > usable_solar + 1e-8 or (limit is not None and base > limit + 1e-8):
            return None
        if not running_options:
            continue
        load = base + sum(by_id[job_id].power_kw * model.x[job_id, start] for job_id, start in running_options)
        model.limits.add(load <= usable_solar)
        if limit is not None:
            model.limits.add(load <= limit)

    movement = sum(
        by_id[job_id].priority * abs(start - original[job_id]) * model.x[job_id, start]
        for job_id, start in pairs
    )
    base = len(jobs) + 1
    model.value = pyo.Expression(expr=sum(base ** (by_id[job_id].priority - 1) * model.x[job_id, start] for job_id, start in pairs))
    model.objective = pyo.Objective(expr=model.value if allow_partial else movement, sense=pyo.maximize if allow_partial else pyo.minimize)
    solver = Highs()
    solver.config.load_solution = False
    solver.config.time_limit = 5
    result = solver.solve(model)
    if result.termination_condition != TerminationCondition.optimal:
        return None
    solver.load_vars()
    if allow_partial:
        value = float(pyo.value(model.value))
        model.keep_priority = pyo.Constraint(expr=model.value >= value - 1e-6)
        model.objective.set_sense(pyo.minimize)
        model.objective.set_value(movement)
        result = solver.solve(model)
        if result.termination_condition != TerminationCondition.optimal:
            return None
        solver.load_vars()
    starts = {
        **{job.job_id: current[job.job_id] for job in fixed},
        **{job_id: start for job_id, start in pairs if pyo.value(model.x[job_id, start]) > .5},
    }
    errors = validate_revision(frame, jobs, current, starts, now, factor, limit, allow_partial=allow_partial)
    if errors:
        raise RuntimeError(f"Revised schedule failed validation: {errors}")
    return starts
