from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from .config import MAX_ROWS


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SiteInput(StrictInput):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    pv_capacity_kwp: float = Field(gt=0)


class PredictionRequest(SiteInput):
    timestamp: datetime
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


class WeatherPredictionRequest(SiteInput):
    weather_source: Literal["forecast", "historical"]
    start_date: date
    end_date: date
    start_time: time
    end_time: time


ManualPayload = (
    PredictionRequest
    | Annotated[list[PredictionRequest], Field(min_length=1, max_length=MAX_ROWS)]
)
