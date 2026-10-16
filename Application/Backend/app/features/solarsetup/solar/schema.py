"""All angles in degrees; azimuth clockwise from true North (0=N, 90=E)."""

from typing import Literal
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SolarSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timezone: str = "Asia/Colombo"
    altitude_m: float = Field(default=0, ge=-400, le=6000)
    year: int = Field(default=2026, ge=2000, le=2100)
    interval_minutes: Literal[15, 30, 60] = 30
    weather_mode: Literal["clear_sky", "historical", "csv"] = "clear_sky"
    # Explicit equisolid/equidistant 180-degree circular hemisphere only.
    projection: Literal["equisolid", "equidistant"]
    center_x: float = Field(ge=0, le=1, description="Fraction of image width minus one")
    center_y: float = Field(
        ge=0, le=1, description="Fraction of image height minus one"
    )
    radius: float = Field(
        gt=0, le=0.5, description="Horizon radius / (min(width,height)-1)"
    )
    north_offset_deg: float = Field(
        default=0,
        ge=0,
        lt=360,
        description="True North position clockwise from image top",
    )
    azimuth_clockwise: bool
    geometry_status: Literal["assumed", "verified"] = "assumed"
    geometry_acknowledged: bool = False
    baseline_tilt: float = Field(default=7, ge=0, le=90)
    baseline_azimuth: float = Field(default=180, ge=0, lt=360)
    max_tilt: float = Field(default=60, gt=0, le=90)
    albedo: float = Field(default=0.2, ge=0, le=1)
    panel_count: int | None = Field(default=None, ge=1, le=10000)
    panel_watts: float | None = Field(default=None, gt=0, le=2000)
    performance_ratio: float = Field(default=0.8, gt=0, le=1)
    seed: int = Field(default=42, ge=0, le=2**31 - 2)

    @model_validator(mode="after")
    def check_settings(self):
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Use an IANA timezone, for example Asia/Colombo.")
        if not self.geometry_acknowledged:
            raise ValueError(
                "Confirm the full 180° hemisphere geometry and image direction settings, or explicitly acknowledge assumed geometry."
            )
        if self.baseline_tilt > self.max_tilt:
            raise ValueError(
                "Baseline tilt must lie within the optimization tilt bounds."
            )
        if (self.panel_count is None) != (self.panel_watts is None):
            raise ValueError(
                "Provide both panel count and panel watts, or leave both empty."
            )
        if self.weather_mode == "historical":
            if self.interval_minutes != 60:
                raise ValueError("Historical weather uses 60-minute intervals.")
            if self.year >= datetime.now(timezone.utc).year:
                raise ValueError("Historical mode requires a completed past year (e.g. 2025), not the current or a future year.")
        return self
