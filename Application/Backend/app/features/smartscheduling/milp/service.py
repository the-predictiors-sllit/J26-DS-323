from datetime import datetime, timedelta
from typing import Callable

import pandas as pd

from ..solar_prediction.forecast import prepare_forecast_slots
from .optimizer import ApplianceJob, solve_solar_only
from .schemas import SchedulerRequest, TZ


def generate_schedule(
    request: SchedulerRequest, progress: Callable[[int, str], None] = lambda *_: None
):
    slots = prepare_forecast_slots(
        latitude=request.latitude,
        longitude=request.longitude,
        pv_capacity_kwp=request.pv_capacity_kwp,
        start_date=request.start_date,
        prediction_model_minutes=request.prediction_model_minutes,
        progress=progress,
    )
    now = pd.Timestamp.now(tz="Asia/Colombo")
    days = []
    for index in range(14):
        day = request.start_date + timedelta(days=index)
        progress(15 + int(index / 14 * 80), f"Scheduling day {index + 1} of 14")
        frame = slots.loc[slots.timestamp.dt.date == day].copy()
        if day == now.date():
            frame = frame.loc[frame.timestamp >= now.ceil("15min")].copy()
        frame["base_load_kw"] = request.background_load_kw
        frame["timestamp"] = frame.timestamp.map(lambda value: value.isoformat())
        active = [item for item in request.appliances if item.runs_on(day)]
        base = {"date": day.isoformat(), "appliance_count": len(active), "schedule": []}
        if frame.empty:
            days.append(
                {
                    **base,
                    "status": "infeasible" if active else "idle",
                    "reason": "No future daytime slots remain on this date.",
                    "slots": [],
                }
            )
            continue
        if not active:
            days.append(
                {
                    **base,
                    "status": "idle",
                    "reason": "No appliances requested on this date.",
                    "slots": [
                        {
                            **row,
                            "usable_solar_kw": row["solar_kw"]
                            * request.solar_safety_factor,
                            "scheduled_total_kw": request.background_load_kw,
                        }
                        for row in frame.to_dict(orient="records")
                    ],
                }
            )
            continue
        jobs = [
            ApplianceJob(
                item.id,
                item.power_kw,
                item.duration_minutes,
                item.earliest_start.strftime("%H:%M"),
                item.latest_finish.strftime("%H:%M"),
                item.preferred_start.strftime("%H:%M"),
                item.priority,
            )
            for item in active
        ]
        result = solve_solar_only(
            frame,
            jobs,
            interval_minutes=15,
            safety_factor=request.solar_safety_factor,
            household_limit_kw=request.max_household_power_kw,
            time_limit_seconds=8,
        )
        if result["status"] != "optimal":
            days.append(
                {
                    **base,
                    "status": result["status"],
                    "reason": result.get(
                        "reason",
                        "The solver did not prove an optimal schedule within the time limit.",
                    ),
                    "slots": [
                        {
                            **row,
                            "usable_solar_kw": row["solar_kw"]
                            * request.solar_safety_factor,
                            "scheduled_total_kw": None,
                        }
                        for row in frame.to_dict(orient="records")
                    ],
                }
            )
            continue
        names = {item.id: item.name for item in active}
        schedule = [
            {**item, "appliance_id": item["job_id"], "name": names[item["job_id"]]}
            for item in result["schedule"]
        ]
        days.append(
            {
                **base,
                "status": "optimal",
                "schedule": schedule,
                "slots": result["trace"].to_dict(orient="records"),
                "metrics": {
                    key: result[key]
                    for key in (
                        "valid",
                        "weighted_start_shift_minutes",
                        "peak_load_kw",
                        "load_energy_kwh",
                        "solar_utilization_pct",
                        "solve_seconds",
                    )
                },
            }
        )
    progress(100, "Schedule complete")
    return {
        "timezone": "Asia/Colombo",
        "scheduling_interval_minutes": 15,
        "prediction_model_minutes": request.prediction_model_minutes,
        "aggregation": (
            "minimum of three 5-minute point predictions"
            if request.prediction_model_minutes == 5
            else "15-minute point prediction"
        ),
        "forecast_source": "Open-Meteo",
        "generated_at": datetime.now(TZ).isoformat(),
        "days": days,
        "notes": [
            "Forecast-based plan; not proof of actual solar-only operation.",
            "No grid, home battery, or export credits modeled.",
            "Deviation-driven monitoring and rescheduling is TODO.",
        ],
    }
