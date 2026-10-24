from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from pydantic import ValidationError

from .config import LOCAL_TZ, MAX_ROWS
from .inference import predict_solar_power
from .schemas import PredictionRequest, WeatherPredictionRequest
from .weather import OpenMeteoError, get_forecast_weather, get_historical_weather


def local_timestamp(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=LOCAL_TZ)
        if value.tzinfo is None
        else value.astimezone(LOCAL_TZ)
    )


def validate_time(value: time, interval: int):
    if value.tzinfo is not None or value.second or value.microsecond:
        raise HTTPException(422, "Use local Sri Lankan times with zero seconds.")
    if not time(6) <= value <= time(19) or value.minute % interval:
        raise HTTPException(
            422, f"Times must be 06:00–19:00 in {interval}-minute steps."
        )


def schedule(payload: WeatherPredictionRequest, interval: int) -> list[datetime]:
    validate_time(payload.start_time, interval)
    validate_time(payload.end_time, interval)
    days = (payload.end_date - payload.start_date).days + 1
    if not 1 <= days <= 31:
        raise HTTPException(422, "Choose an ordered date range of at most 31 days.")
    start_minutes = payload.start_time.hour * 60 + payload.start_time.minute
    end_minutes = payload.end_time.hour * 60 + payload.end_time.minute
    if start_minutes > end_minutes:
        raise HTTPException(
            422, "The daily end time must be at or after the start time."
        )
    count = days * ((end_minutes - start_minutes) // interval + 1)
    if count > MAX_ROWS:
        raise HTTPException(
            422, f"Choose a smaller range: at most {MAX_ROWS} slots per request."
        )
    return [
        datetime.combine(
            payload.start_date + timedelta(days=day), payload.start_time, LOCAL_TZ
        )
        + timedelta(minutes=offset)
        for day in range(days)
        for offset in range(0, end_minutes - start_minutes + 1, interval)
    ]


def run_prediction(
    rows: list[PredictionRequest], interval: int, source: str = "manual"
):
    if not 1 <= len(rows) <= MAX_ROWS:
        raise HTTPException(422, f"Provide between 1 and {MAX_ROWS} input rows.")
    variables = []
    timestamps = []
    for row in rows:
        timestamp = local_timestamp(row.timestamp)
        validate_time(timestamp.time(), interval)
        timestamps.append(timestamp.isoformat())
        variables.append({**row.model_dump(), "timestamp": timestamp})
    if len(set(timestamps)) != len(timestamps):
        raise HTTPException(422, "Each timestamp must be unique.")
    try:
        predictions = predict_solar_power(variables, interval_minutes=interval)
    except FileNotFoundError as exc:
        raise HTTPException(
            503, f"The {interval}-minute model files are not installed on this backend."
        ) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    records = predictions.to_dict(orient="records")
    if len(records) != len(rows):
        raise HTTPException(
            500, "The model returned an unexpected number of predictions."
        )
    return {
        "predictions": [
            {"timestamp": stamp, **record} for stamp, record in zip(timestamps, records)
        ],
        "model_interval_minutes": interval,
        "weather_source": source,
        "timezone": "Asia/Colombo",
    }


def predict_with_weather(payload: WeatherPredictionRequest, interval: int):
    times = schedule(payload, interval)
    today = datetime.now(LOCAL_TZ).date()
    if payload.weather_source == "forecast":
        if payload.start_date < today or payload.end_date > today + timedelta(days=15):
            raise HTTPException(
                422,
                "Forecast dates must be today through today + 15 dates in Sri Lankan time.",
            )
        fetch_weather = get_forecast_weather
    else:
        if payload.start_date < date(1940, 1, 1) or payload.end_date > today:
            raise HTTPException(
                422, "Historical dates must be from 1940-01-01 through today."
            )
        fetch_weather = get_historical_weather
    # Fetch once for the continuous span, then select the requested daily windows.
    # Open-Meteo helpers preserve the hourly backward join used during training.
    try:
        weather = fetch_weather(
            latitude=payload.latitude,
            longitude=payload.longitude,
            start=times[0],
            end=times[-1],
            interval_minutes=interval,
            timeout=40,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OpenMeteoError as exc:
        raise HTTPException(502, f"Weather service unavailable: {exc}") from exc
    by_time = {
        local_timestamp(datetime.fromisoformat(row["timestamp"])): row
        for row in weather.to_dict(orient="records")
    }
    if any(timestamp not in by_time for timestamp in times):
        raise HTTPException(502, "Weather data is incomplete for the selected range.")
    site = {
        name: getattr(payload, name)
        for name in ("latitude", "longitude", "pv_capacity_kwp")
    }
    try:
        rows = [
            PredictionRequest(**{**by_time[timestamp], **site}) for timestamp in times
        ]
    except ValidationError as exc:
        raise HTTPException(
            502, "The weather provider returned invalid model input values."
        ) from exc
    result = run_prediction(rows, interval, payload.weather_source)
    result["weather_alignment"] = "Latest preceding hourly weather; no interpolation."
    return result
