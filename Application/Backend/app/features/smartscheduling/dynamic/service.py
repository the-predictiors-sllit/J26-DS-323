"""Offline replay. This module does not control appliances or run a live monitor."""
from __future__ import annotations

import pandas as pd

from ..milp.optimizer import ApplianceJob, solve_solar_only, prepare, evaluate_schedule
from .optimizer import revise
from .monitoring import assess_observations
from .plans import schedule_records, scheduled_load
from .sources import TZ, ObservationSource, CsvObservationSource, configured_source, available_dates, historical_predictions

def replay(request, source: ObservationSource | None = None, predictions: pd.DataFrame | None = None):
    source = source or configured_source()
    actual = source.read_day(request.day)
    if actual.empty:
        raise ValueError("No inverter observations are available for this date.")
    actual = actual.sort_values("timestamp").reset_index(drop=True)
    supplied_plan = getattr(request, "initial_plan", None)
    if supplied_plan is not None and any(slot.timestamp.utcoffset() is None for slot in supplied_plan.slots):
        raise ValueError("Saved plan timestamps must include a timezone offset.")
    forecast = (pd.DataFrame([slot.model_dump() for slot in supplied_plan.slots]) if supplied_plan is not None
        else predictions.copy() if predictions is not None else historical_predictions(
            request.day, request.latitude, request.longitude, request.pv_capacity_kwp))
    forecast = forecast.sort_values("timestamp").reset_index(drop=True)
    forecast["timestamp"] = pd.to_datetime(forecast.timestamp, utc=True).dt.tz_convert(TZ)
    forecast["base_load_kw"] = request.background_load_kw
    active = [a for a in request.appliances if a.runs_on(request.day)]
    if not active:
        raise ValueError("No enabled appliances run on the selected date.")
    jobs = [ApplianceJob(a.id, a.power_kw, a.duration_minutes, a.earliest_start.strftime("%H:%M"),
                         a.latest_finish.strftime("%H:%M"), a.preferred_start.strftime("%H:%M"), a.priority) for a in active]
    # The replay needs a baseline before it can simulate later revisions.
    if supplied_plan is not None:
        input_frame = forecast.assign(timestamp=forecast.timestamp.map(lambda x: x.isoformat()))
        checked, _, candidates, _ = prepare(input_frame, jobs, 15, request.solar_safety_factor, request.max_household_power_kw)
        stamps = pd.to_datetime(checked.timestamp, utc=True)
        if len(stamps) != 52 or any(stamp.tz_convert(TZ).date() != request.day for stamp in stamps) or stamps.iloc[0].tz_convert(TZ).hour != 6 or stamps.iloc[0].tz_convert(TZ).minute != 0:
            raise ValueError("The saved plan must contain all 52 daytime slots for the selected date.")
        index_by_time = {stamp.value: i for i, stamp in enumerate(stamps)}
        starts = {}
        for item in supplied_plan.schedule:
            if item.start.utcoffset() is None or item.appliance_id in starts or item.appliance_id not in candidates:
                raise ValueError("The saved plan has invalid or duplicate appliance starts.")
            index = index_by_time.get(pd.Timestamp(item.start).value)
            if index not in candidates[item.appliance_id]:
                raise ValueError(f"Saved start for {item.appliance_id} is outside its time window.")
            starts[item.appliance_id] = index
        evaluation = evaluate_schedule(checked, jobs, starts, 15, household_limit_kw=request.max_household_power_kw, allow_unscheduled=True)
        if not evaluation["valid"]:
            raise ValueError("Saved plan fails the solar or household constraints: " + "; ".join(evaluation["violations"]))
        initial = {"status": "optimal", "starts": starts, "unscheduled": [job.job_id for job in jobs if job.job_id not in starts]}
    else:
        initial = solve_solar_only(forecast.assign(timestamp=forecast.timestamp.map(lambda x: x.isoformat())), jobs,
            safety_factor=request.solar_safety_factor, household_limit_kw=request.max_household_power_kw, allow_partial=True)
    if initial["status"] != "optimal":
        reason = initial.get("reason") or (
            "No initial schedule satisfies the available solar and appliance constraints."
            if initial["status"] == "infeasible"
            else "The solver did not prove an optimal initial schedule."
        )
        return {"status": initial["status"], "reason": reason, "frames": []}
    original = dict(initial["starts"])
    current = original.copy()
    names = {a.id: a.name for a in active}
    # Initially omitted jobs are reported; they are not silently moved to another day.
    unscheduled = list(initial["unscheduled"])
    jobs = [job for job in jobs if job.job_id in original]
    def schedule(starts):
        return schedule_records(forecast, jobs, names, starts)
    first = schedule(original)
    frames = []
    last_trigger = -999
    # Replay advances one slot at a time. Only readings already available at
    # that simulated time are passed into the shortfall decision.
    for t, row in forecast.iterrows():
        now = row.timestamp
        available = actual.loc[(actual.timestamp <= now) & (actual.timestamp >= now - pd.Timedelta(minutes=10))]
        reading = float(available.actual_kw.iloc[-1]) if not available.empty else None
        age_seconds = float((now - available.timestamp.iloc[-1]).total_seconds()) if not available.empty else None
        predicted = float(row.solar_kw)
        assessment = assess_observations(actual, forecast, now, getattr(request, "detection_method", "latest"))
        observed, reference = assessment.observed_kw, assessment.predicted_kw
        shortfall = reference - observed if reference is not None and observed is not None else 0
        # Require both an absolute and a relative drop; avoid ratios near zero.
        threshold_met = observed is not None and reference is not None and reference >= 0.2 and shortfall >= request.threshold_kw and shortfall / reference >= request.threshold_ratio
        cooldown_remaining = max(0, 4 - (t - last_trigger)) * 15
        trigger = threshold_met and cooldown_remaining == 0
        event = None
        proposal = None
        proposed_unscheduled = []
        event_before = None
        event_after = None
        outcome = None
        if trigger:
            last_trigger = t
            revised_forecast = forecast.copy()
            # Simple bounded persistence correction for the next hour; not a validated forecasting model.
            ratio = min(1.0, max(0.0, observed / reference))
            revised_forecast.loc[t:min(t + 3, len(forecast) - 1), "solar_kw"] *= ratio
            active_jobs = [job for job in jobs if job.job_id in current]
            pending = any(current[job.job_id] >= t for job in active_jobs)
            updated = revise(revised_forecast, active_jobs, original, current, t, request.solar_safety_factor, request.max_household_power_kw, allow_partial=True) if pending else None
            if not pending:
                event = "Shortfall detected; no pending jobs remain to reschedule."
                outcome = "no_pending"
            elif updated is None:
                event = "No revised plan was proven optimal; the existing plan was retained. It may be infeasible or the solver may have stopped early."
                outcome = "unresolved"
            else:
                removed = [key for key in current if key not in updated]
                changed = sum(updated.get(k) != current[k] for k in current)
                # Save both snapshots before changing state so the UI can compare
                # the plans at this particular event, not only the final plan.
                event_before = schedule(current)
                event_after = schedule(updated)
                if getattr(request, "apply_rescheduling", True):
                    unscheduled.extend(key for key in removed if key not in unscheduled)
                    current = updated
                    event = f"Reoptimized: {changed} pending run(s) changed; {len(removed)} could not be rescheduled." + (f" Unscheduled: {', '.join(names[key] for key in removed)}." if removed else "")
                    outcome = "changed" if changed else "unchanged"
                else:
                    proposal = schedule(updated)
                    proposed_unscheduled = [{"appliance_id": key, "name": names[key]} for key in removed]
                    event = f"Shortfall detected: {changed} pending run(s) could change, including {len(removed)} that could not be rescheduled. Detect-only mode retained the current plan."
                    outcome = "proposed"
        frames.append({"timestamp": now.isoformat(), "predicted_kw": predicted, "actual_kw": reading,
            "measurement_age_seconds": age_seconds,
            "original_load_kw": scheduled_load(jobs, original, t, request.background_load_kw),
            "revised_load_kw": scheduled_load(jobs, current, t, request.background_load_kw),
            "event": event, "outcome": outcome, "before_schedule": event_before, "after_schedule": event_after,
            "detection": {"method": getattr(request, "detection_method", "latest"), "observed_kw": observed,
                "predicted_kw": reference, "samples": assessment.samples, "reason": assessment.reason,
                "shortfall_kw": shortfall if observed is not None else None, "threshold_met": threshold_met,
                "cooldown_remaining_minutes": cooldown_remaining},
            "unscheduled": [{"appliance_id": key, "name": names[key]} for key in unscheduled],
            "proposed_unscheduled": proposed_unscheduled,
            "proposal": proposal, "schedule": schedule(current)})
    return {"status": "completed", "date": request.day.isoformat(), "initial_plan_source": "saved_14_day_plan" if supplied_plan is not None else "generated_for_replay", "original_schedule": first,
            "initial_unscheduled": [{"appliance_id": key, "name": names[key]} for key in initial["unscheduled"]], "frames": frames,
            "warnings": ["Historical weather is retrospective reanalysis, not an archived day-ahead forecast; this replay is exploratory.",
                         "Assumes CSV pac is AC watts; confirm inverter units, site coordinates and PV capacity.",
                         "Appliance execution is simulated from its schedule; no appliance is controlled.",
                         "Readings are most recent observations at or before each 15-minute boundary (maximum age 10 minutes)."]}
