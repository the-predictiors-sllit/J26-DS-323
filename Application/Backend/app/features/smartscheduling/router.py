from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .components.functions.solar_prediction_model import (
    predict_solar_power,
)
router = APIRouter(tags=["smartscheduling"])


@router.get("")
def smartscheduling() -> dict[str, str]:
    return {"feature": "smartscheduling", "status": "available"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"feature": "smartscheduling", "status": "ok"}


# -------------------------------------------------------------

class PredictionRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    timestamp: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    pv_capacity_kwp: float = Field(gt=0)

    weather_temperature_c: float
    weather_relative_humidity_pct: float = Field(ge=0, le=100)
    weather_wind_speed_ms: float = Field(ge=0)

    weather_cloud_cover_pct: float = Field(ge=0, le=100)
    weather_cloud_cover_low_pct: float = Field(ge=0, le=100)
    weather_cloud_cover_mid_pct: float = Field(ge=0, le=100)
    weather_cloud_cover_high_pct: float = Field(ge=0, le=100)

    weather_ghi_instant_wm2: float = Field(ge=0)
    weather_dni_instant_wm2: float = Field(ge=0)
    weather_dhi_instant_wm2: float = Field(ge=0)

    weather_preceding_hour_precipitation_mm: float = Field(ge=0)
    weather_preceding_hour_rain_mm: float = Field(ge=0)


def run_prediction(rows: list[PredictionRequest]):
    if not rows:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one input row.",
        )

    variables = [
        row.model_dump()
        for row in rows
    ]

    try:
        predictions = predict_solar_power(variables)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    return {
        "predictions": predictions.to_dict(orient="records")
    }


# Input supplied by the user.
@router.post("/predictinput15min")
def predict_from_request(
    payload: PredictionRequest | list[PredictionRequest],
):
    rows = payload if isinstance(payload, list) else [payload]
    return run_prediction(rows)


# Input supplied by the backend.
def get_backend_inputs() -> list[PredictionRequest]:
    # Example data: replace with actual backend/weather data.
    first_slot = PredictionRequest(
        timestamp=datetime.fromisoformat(
            "2024-02-29T08:15:00+05:30"
        ),
        latitude=6.2353,
        longitude=80.055,
        pv_capacity_kwp=15.0,
        weather_temperature_c=27.8,
        weather_relative_humidity_pct=80,
        weather_wind_speed_ms=1.6,
        weather_cloud_cover_pct=100,
        weather_cloud_cover_low_pct=10,
        weather_cloud_cover_mid_pct=0,
        weather_cloud_cover_high_pct=100,
        weather_ghi_instant_wm2=349.1,
        weather_dni_instant_wm2=409.3,
        weather_dhi_instant_wm2=188.8,
        weather_preceding_hour_precipitation_mm=0.0,
        weather_preceding_hour_rain_mm=0.0,
    )


    return [first_slot, first_slot]


@router.post("/predictbackend15min")
def predict_from_backend():
    return run_prediction(get_backend_inputs())