"""Read historical PV observations; future live sources can implement the same protocol."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from zoneinfo import ZoneInfo
import csv
import math

COLOMBO = ZoneInfo("Asia/Colombo")


@dataclass(frozen=True)
class Measurement:
    timestamp: datetime
    power_kw: float


class MeasurementSource(Protocol):
    def readings(self, start: datetime, end: datetime) -> list[Measurement]:
        """Return observations in [start, end), ordered by timestamp."""


class CsvMeasurementSource:
    """Adapter for the Meepe inverter CSV. pac is assumed to be in watts."""

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def readings(self, start: datetime, end: datetime) -> list[Measurement]:
        if start.utcoffset() is None or end.utcoffset() is None or start >= end:
            raise ValueError("Use timezone-aware start and end, with start before end.")
        result: list[Measurement] = []
        seen: set[datetime] = set()
        with self.path.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            if not {"dataTimestamp", "pac"}.issubset(reader.fieldnames or []):
                raise ValueError("CSV needs dataTimestamp and pac columns.")
            for line, row in enumerate(reader, start=2):
                try:
                    epoch_ms = float(row["dataTimestamp"])
                    watts = float(row["pac"])
                    if not math.isfinite(epoch_ms) or not math.isfinite(watts) or watts < 0:
                        raise ValueError("invalid timestamp or power")
                    stamp = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).astimezone(COLOMBO)
                except (ValueError, TypeError, OverflowError, OSError) as exc:
                    raise ValueError(f"Invalid observation at CSV line {line}.") from exc
                if stamp in seen:
                    raise ValueError(f"Duplicate measurement timestamp at CSV line {line}.")
                seen.add(stamp)
                if start <= stamp < end:
                    result.append(Measurement(stamp, watts / 1000))
        return sorted(result, key=lambda item: item.timestamp)


def latest_observation(source: MeasurementSource, start: datetime, now: datetime) -> Measurement | None:
    """Replay uses observations strictly before now: it must not see the future."""
    values = source.readings(start, now)
    return values[-1] if values else None
