"""Provider contract. The Solis implementation is intentionally a stub."""
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class SolarReading:
    timestamp: datetime  # timezone-aware instant, not the fetch time
    power_kw: float       # AC generation in kW


class ProviderUnavailable(Exception):
    """The source is not ready or cannot return trustworthy data."""


class LiveSolarProvider(Protocol):
    name: str

    def is_implemented(self) -> bool: ...

    def read_between(self, start: datetime, end: datetime) -> list[SolarReading]:
        """Return readings in the inclusive interval; never use future data."""
        ...


class SolisProvider:
    """Replace this adapter once authorized API access and field units are known.

    Keep credentials and provider HTTP calls on the server. This stub does not
    send requests, and the presence of environment variables does not make it
    look connected.
    """
    name = "SolisCloud"

    def is_implemented(self) -> bool:
        return False

    def read_between(self, start: datetime, end: datetime) -> list[SolarReading]:
        raise ProviderUnavailable("The SolisCloud provider has not been implemented.")


def get_live_provider() -> LiveSolarProvider:
    return SolisProvider()
