from datetime import date, time, timedelta, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, model_validator

TZ = ZoneInfo("Asia/Colombo")


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Appliance(InputModel):
    id: str = Field(min_length=1, max_length=60, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=80)
    power_kw: float = Field(gt=0, le=100)
    duration_minutes: int = Field(ge=15, le=780, multiple_of=15)
    earliest_start: time
    latest_finish: time
    preferred_start: time
    priority: int = Field(ge=1, le=5)
    recurrence: Literal["daily", "weekdays", "once"] = "daily"
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    run_date: date | None = None
    enabled: bool = True

    @model_validator(mode="after")
    def validate_rules(self):
        for clock in (self.earliest_start, self.latest_finish, self.preferred_start):
            if clock.tzinfo is not None or clock.second or clock.microsecond or clock.minute % 15 or not time(6) <= clock <= time(19):
                raise ValueError("Use Sri Lankan times between 06:00 and 19:00 in 15-minute steps.")
        minutes = lambda clock: clock.hour * 60 + clock.minute
        if minutes(self.latest_finish) - minutes(self.earliest_start) < self.duration_minutes:
            raise ValueError("The operating window must fit the full duration.")
        if not minutes(self.earliest_start) <= minutes(self.preferred_start) <= minutes(self.latest_finish) - self.duration_minutes:
            raise ValueError("Preferred start must allow the job to finish before its deadline.")
        if len(set(self.weekdays)) != len(self.weekdays) or any(day < 0 or day > 6 for day in self.weekdays):
            raise ValueError("Weekdays must be unique values from 0 (Monday) to 6 (Sunday).")
        if self.recurrence == "weekdays" and not self.weekdays:
            raise ValueError("Choose at least one weekday.")
        if self.recurrence == "once" and self.run_date is None:
            raise ValueError("Choose a run date for a one-time job.")
        return self

    def runs_on(self, day: date):
        return self.enabled and (self.recurrence == "daily" or self.recurrence == "once" and self.run_date == day or self.recurrence == "weekdays" and day.weekday() in self.weekdays)


class SchedulerRequest(InputModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    pv_capacity_kwp: float = Field(gt=0, le=1000)
    start_date: date
    prediction_model_minutes: Literal[5, 15] = 15
    solar_safety_factor: float = Field(gt=0, le=1, default=.9)
    background_load_kw: float = Field(ge=0, default=0)
    max_household_power_kw: float | None = Field(gt=0, default=None)
    appliances: list[Appliance] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_request(self):
        today = datetime.now(TZ).date()
        if not today <= self.start_date <= today + timedelta(days=2):
            raise ValueError("Start today, tomorrow, or the next date so all 14 dates fit the 16-day forecast window.")
        if len({item.id for item in self.appliances}) != len(self.appliances):
            raise ValueError("Appliance IDs must be unique.")
        if not any(item.enabled for item in self.appliances):
            raise ValueError("Enable at least one appliance.")
        last = self.start_date + timedelta(days=13)
        for item in self.appliances:
            if item.enabled and item.recurrence == "once" and not self.start_date <= item.run_date <= last:
                raise ValueError(f"{item.name}: one-time run date must be inside the selected 14-day window.")
        return self
