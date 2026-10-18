"""Step 9: reusable version of the three-appliance, hourly solar-only MILP.

This keeps the tutorial's solar={9: 1.0, ...} input format. Subhourly timestamp
inputs will be introduced separately; no tariff, grid, battery, or API code.
"""
import math
from time import perf_counter

import pyomo.environ as pyo



def time_to_minutes(value):
    hour, minute = map(int, value.split(":"))
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError(f"Invalid time: {value}")
    return hour * 60 + minute


def minutes_to_time(value):
    return f"{value // 60:02d}:{value % 60:02d}"


def _evaluate(starts, solar_slots, appliances, settings, slot_minutes):
    """Reconstruct operation from starts, independently of model expressions."""
    errors, schedule_rows, slot_rows = [], [], []
    penalty = 0
    for name, appliance in appliances.items():
        start = starts[name]
        duration = appliance["duration_minutes"]
        finish = start + duration
        if start < time_to_minutes(appliance["earliest_start"]):
            errors.append(f"{name}: starts too early.")
        if finish > time_to_minutes(appliance["latest_finish"]):
            errors.append(f"{name}: finishes too late.")
        if any(slot not in solar_slots for slot in range(start, finish, slot_minutes)):
            errors.append(f"{name}: required slots are missing.")
        penalty += appliance["priority"] * abs(start - time_to_minutes(appliance["preferred_start"]))
        schedule_rows.append({
            "appliance": name, "start": minutes_to_time(start),
            "finish": minutes_to_time(finish), "power_kw": appliance["power_kw"],
            "duration_minutes": duration, "energy_kwh": appliance["power_kw"] * duration / 60,
        })
    for slot, solar_kw in sorted(solar_slots.items()):
        running = [name for name, start in starts.items() if start <= slot < start + appliances[name]["duration_minutes"]]
        appliance_kw = sum(appliances[name]["power_kw"] for name in running)
        total_kw = settings["background_load_kw"] + appliance_kw
        usable_kw = solar_kw * settings["solar_safety_factor"]
        if total_kw > usable_kw + 1e-6:
            errors.append(f"{minutes_to_time(slot)}: solar limit exceeded.")
        limit = settings["max_household_power_kw"]
        if limit is not None and total_kw > limit + 1e-6:
            errors.append(f"{minutes_to_time(slot)}: household limit exceeded.")
        slot_rows.append({"time": minutes_to_time(slot), "running": running,
                          "appliance_kw": appliance_kw, "total_kw": total_kw,
                          "usable_solar_kw": usable_kw})
    energy = sum(row["appliance_kw"] * slot_minutes / 60 for row in slot_rows)
    expected = sum(row["energy_kwh"] for row in schedule_rows)
    if abs(energy - expected) > 1e-6:
        errors.append("Scheduled energy does not match required job energy.")
    return {
        "valid": not errors, "errors": errors, "schedule": schedule_rows,
        "slots": slot_rows, "appliance_energy_kwh": energy,
        "peak_household_kw": max(row["total_kw"] for row in slot_rows),
        "weighted_start_penalty": penalty,
    }


def optimize_appliance_schedule(solar, appliances, settings=None, slot_minutes=60):
    """Validate -> build -> solve twice -> independently evaluate -> return.

    Each call creates a fresh model. Missing solver/invalid inputs raise errors;
    valid but impossible scheduling requests return status='infeasible'.
    Results contain only plain Python values, suitable for later JSON responses.
    """
    started = perf_counter()
    settings = {
        "solar_safety_factor": 1.0,
        "background_load_kw": 0.0,
        "max_household_power_kw": None,
        **(settings or {}),
    }
    if slot_minutes != 60:
        raise ValueError("This tutorial step uses hourly solar keys. Use slot_minutes=60.")
    if not solar or not appliances:
        raise ValueError("Provide solar data and at least one appliance.")
    if any(not isinstance(hour, int) or not 0 <= hour <= 23 for hour in solar):
        raise ValueError("Solar keys must be integer hours from 0 through 23.")
    if any(not math.isfinite(power) or power < 0 for power in solar.values()):
        raise ValueError("Solar power must be finite and nonnegative.")
    factor, background, limit = (settings[key] for key in ("solar_safety_factor", "background_load_kw", "max_household_power_kw"))
    if not math.isfinite(factor) or not 0 < factor <= 1:
        raise ValueError("solar_safety_factor must be in (0, 1].")
    if not math.isfinite(background) or background < 0:
        raise ValueError("background_load_kw must be finite and nonnegative.")
    if limit is not None and (not math.isfinite(limit) or limit <= 0):
        raise ValueError("max_household_power_kw must be positive or None.")

    solar_slots = {hour * 60: power for hour, power in solar.items()}
    valid_starts = {}
    for name, appliance in appliances.items():
        power, duration = appliance["power_kw"], appliance["duration_minutes"]
        priority = appliance["priority"]
        if not math.isfinite(power) or power <= 0:
            raise ValueError(f"{name}: power_kw must be finite and positive.")
        if not isinstance(duration, int) or duration <= 0 or duration % slot_minutes:
            raise ValueError(f"{name}: duration must be a positive multiple of {slot_minutes}.")
        if not isinstance(priority, int) or priority < 1:
            raise ValueError(f"{name}: priority must be a positive integer.")
        earliest, deadline, preferred = [time_to_minutes(appliance[key]) for key in ("earliest_start", "latest_finish", "preferred_start")]
        if earliest >= deadline:
            raise ValueError(f"{name}: earliest_start must be before latest_finish.")
        valid_starts[name] = [start for start in sorted(solar_slots)
            if start >= earliest and start + duration <= deadline
            and all(slot in solar_slots for slot in range(start, start + duration, slot_minutes))]
        if not valid_starts[name]:
            return {"status": "infeasible", "reason": f"{name}: no start fits its full duration and time window.", "evaluation": None, "solve_seconds": perf_counter() - started}

    # Steps 3–5: start decisions, complete jobs, power limits, and objectives.
    model = pyo.ConcreteModel()
    options = [(name, start) for name, starts in valid_starts.items() for start in starts]
    model.start_options = pyo.Set(dimen=2, initialize=options)
    model.start = pyo.Var(model.start_options, domain=pyo.Binary)
    model.appliances = pyo.Set(initialize=list(appliances))
    model.slots = pyo.Set(initialize=sorted(solar_slots), ordered=True)
    model.start_once = pyo.Constraint(model.appliances, rule=lambda m, name:
        sum(m.start[name, start] for start in valid_starts[name]) == 1)
    model.running = pyo.Expression(model.appliances, model.slots, rule=lambda m, name, slot:
        sum(m.start[name, start] for start in valid_starts[name]
            if start <= slot < start + appliances[name]["duration_minutes"]))
    model.total_load = pyo.Expression(model.slots, rule=lambda m, slot:
        background + sum(appliances[name]["power_kw"] * m.running[name, slot] for name in m.appliances))
    model.solar_limit = pyo.Constraint(model.slots, rule=lambda m, slot:
        m.total_load[slot] <= solar_slots[slot] * factor)
    if limit is not None:
        model.household_limit = pyo.Constraint(model.slots, rule=lambda m, slot: m.total_load[slot] <= limit)
    model.peak_power = pyo.Var(domain=pyo.NonNegativeReals)
    model.peak_limit = pyo.Constraint(model.slots, rule=lambda m, slot: m.peak_power >= m.total_load[slot])
    model.total_start_penalty = pyo.Expression(expr=sum(
        appliances[name]["priority"] * abs(start - time_to_minutes(appliances[name]["preferred_start"])) * model.start[name, start]
        for name, start in options))
    model.objective = pyo.Objective(expr=model.total_start_penalty, sense=pyo.minimize)

    # Step 6: solve priorities first, then peak power while preserving priorities.
    solver = pyo.SolverFactory("appsi_highs")
    if not solver.available(exception_flag=False):
        raise RuntimeError("Install the HiGHS solver: pip install highspy")
    solver.options["mip_rel_gap"] = 0.0
    solver.options["threads"] = 1
    solver.options["time_limit"] = 30.0
    for stage in (1, 2):
        result = solver.solve(model, load_solutions=False)
        condition = result.solver.termination_condition
        if condition != pyo.TerminationCondition.optimal:
            return {"status": "infeasible" if condition == pyo.TerminationCondition.infeasible else "not_proven_optimal",
                    "reason": f"Stage {stage}: {condition}", "evaluation": None,
                    "solve_seconds": perf_counter() - started}
        solver.load_vars()
        if stage == 1:
            best_penalty = float(pyo.value(model.total_start_penalty))
            model.keep_best_start_penalty = pyo.Constraint(expr=model.total_start_penalty <= best_penalty + 1e-6)
            model.objective.set_value(model.peak_power)

    starts = {}
    for name, candidates in valid_starts.items():
        chosen = [start for start in candidates if pyo.value(model.start[name, start]) > .5]
        if len(chosen) != 1:
            raise RuntimeError(f"{name}: solver did not select exactly one start.")
        starts[name] = chosen[0]
    evaluation = _evaluate(starts, solar_slots, appliances, settings, slot_minutes)
    if not evaluation["valid"]:
        raise RuntimeError(f"Independent validation failed: {evaluation['errors']}")
    return {"status": "optimal", "evaluation": evaluation, "solve_seconds": perf_counter() - started}
