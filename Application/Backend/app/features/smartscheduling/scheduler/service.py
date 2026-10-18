from datetime import datetime, time, timedelta
from typing import Callable

import numpy as np
import pandas as pd

from .optimizer import ApplianceJob, solve_solar_only
from .schemas import SchedulerRequest, TZ
from ..components.functions.openmeteo import get_forecast_weather
from ..components.functions.solar_prediction_model import predict_solar_power
from ..components.functions.solar_prediction_model.solar_prediction import load_prediction_model


def generate_schedule(request: SchedulerRequest, progress: Callable[[int, str], None] = lambda *_: None):
    # Check model availability before performing the external request.
    load_prediction_model(request.prediction_model_minutes)
    end = request.start_date + timedelta(days=13)
    progress(2, "Fetching 14 days of forecast weather")
    weather = get_forecast_weather(
        request.latitude, request.longitude, request.start_date.isoformat(), end.isoformat(),
        interval_minutes=request.prediction_model_minutes, timeout=45,
    )
    # 19:00 is an end boundary, never a new operating slot.
    times = pd.to_datetime(weather.timestamp, utc=True).dt.tz_convert("Asia/Colombo")
    weather = weather.loc[times.dt.hour * 60 + times.dt.minute < 1140].copy()
    rows = weather.to_dict(orient="records")
    for row in rows:
        row.update(latitude=request.latitude, longitude=request.longitude, pv_capacity_kwp=request.pv_capacity_kwp)
    progress(8, "Generating solar power predictions")
    prediction_chunks = []
    for start in range(0, len(rows), 256):
        predicted = predict_solar_power(rows[start:start + 256], interval_minutes=request.prediction_model_minutes)
        if len(predicted) != len(rows[start:start + 256]):
            raise RuntimeError("The prediction model returned a mismatched number of rows.")
        prediction_chunks.extend(predicted.predicted_power_kw.to_numpy(dtype=float).tolist())
    if len(prediction_chunks) != len(rows) or not np.isfinite(prediction_chunks).all() or (np.array(prediction_chunks) < 0).any():
        raise RuntimeError("The model returned invalid solar predictions.")
    predictions = pd.DataFrame({"timestamp": pd.to_datetime([row["timestamp"] for row in rows], utc=True).tz_convert("Asia/Colombo"), "solar_kw": prediction_chunks})
    predictions["slot"] = predictions.timestamp.dt.floor("15min")
    expected_samples = 15 // request.prediction_model_minutes
    if not predictions.groupby("slot").size().eq(expected_samples).all():
        raise RuntimeError("Forecast coverage is incomplete for one or more scheduling slots.")
    # Conservative reduction, not a claim of measured interval-average power.
    slots = predictions.groupby("slot", as_index=False).solar_kw.min().rename(columns={"slot": "timestamp"})
    expected = pd.DatetimeIndex([
        datetime.combine(request.start_date + timedelta(days=day), time(6), TZ) + timedelta(minutes=15 * offset)
        for day in range(14) for offset in range(52)
    ])
    if list(slots.timestamp) != list(expected):
        raise RuntimeError("Forecast does not cover all 14 daytime windows.")
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
            days.append({**base, "status": "infeasible" if active else "idle", "reason": "No future daytime slots remain on this date.", "slots": []})
            continue
        if not active:
            days.append({**base, "status": "idle", "reason": "No appliances requested on this date.", "slots": [{**row, "usable_solar_kw": row["solar_kw"] * request.solar_safety_factor, "scheduled_total_kw": request.background_load_kw} for row in frame.to_dict(orient="records")]})
            continue
        jobs = [ApplianceJob(item.id, item.power_kw, item.duration_minutes, item.earliest_start.strftime("%H:%M"), item.latest_finish.strftime("%H:%M"), item.preferred_start.strftime("%H:%M"), item.priority) for item in active]
        result = solve_solar_only(frame, jobs, interval_minutes=15, safety_factor=request.solar_safety_factor,
                                  household_limit_kw=request.max_household_power_kw, time_limit_seconds=8)
        if result["status"] != "optimal":
            days.append({**base, "status": result["status"], "reason": result.get("reason", "The solver did not prove an optimal schedule within the time limit."), "slots": [{**row, "usable_solar_kw": row["solar_kw"] * request.solar_safety_factor, "scheduled_total_kw": None} for row in frame.to_dict(orient="records")]})
            continue
        names = {item.id: item.name for item in active}
        schedule = [{**item, "appliance_id": item["job_id"], "name": names[item["job_id"]]} for item in result["schedule"]]
        days.append({**base, "status": "optimal", "schedule": schedule, "slots": result["trace"].to_dict(orient="records"),
                     "metrics": {key: result[key] for key in ("valid", "weighted_start_shift_minutes", "peak_load_kw", "load_energy_kwh", "solar_utilization_pct", "solve_seconds")}})
    progress(100, "Schedule complete")
    return {"timezone": "Asia/Colombo", "scheduling_interval_minutes": 15, "prediction_model_minutes": request.prediction_model_minutes,
            "aggregation": "minimum of three 5-minute point predictions" if request.prediction_model_minutes == 5 else "15-minute point prediction",
            "forecast_source": "Open-Meteo", "generated_at": datetime.now(TZ).isoformat(), "days": days,
            "notes": ["Forecast-based plan; not proof of actual solar-only operation.", "No grid, home battery, or export credits modeled.", "Deviation-driven monitoring and rescheduling is TODO."]}
