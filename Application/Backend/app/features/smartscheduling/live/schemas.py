"""Input shapes for a single, stateless live shortfall assessment."""
from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator
from ..milp.schemas import InputModel


class ForecastSlot(InputModel):
    timestamp: datetime
    solar_kw: float = Field(ge=0)

    @model_validator(mode="after")
    def aware(self):
        if self.timestamp.utcoffset() is None:
            raise ValueError("Forecast timestamps need a UTC offset.")
        return self


class AssessmentRequest(InputModel):
    # These are caller-supplied: persist and verify issue/availability times
    # when connecting the live scheduler. This endpoint does not establish them.
    forecast_available_at: datetime
    forecast: list[ForecastSlot] = Field(min_length=1, max_length=200)
    detection_method: Literal["latest", "recent_average", "recent_average_60"] = "latest"
    threshold_kw: float = Field(default=0.3, gt=0)
    threshold_ratio: float = Field(default=0.2, gt=0, le=1)

    @model_validator(mode="after")
    def validate_times(self):
        if self.forecast_available_at.utcoffset() is None:
            raise ValueError("Forecast availability time needs a UTC offset.")
        stamps = [slot.timestamp for slot in self.forecast]
        if len(set(stamps)) != len(stamps):
            raise ValueError("Forecast timestamps must be unique.")
        return self
