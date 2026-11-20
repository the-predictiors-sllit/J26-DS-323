import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dynamic_rescheduling import CsvMeasurementSource, Measurement, detect_shortfall, latest_observation


class MeasurementTests(unittest.TestCase):
    def test_timezone_power_and_exclusive_end(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "readings.csv"
            path.write_text("dataTimestamp,pac\n1723804344182,1200\n1723804644213,2000\n", encoding="utf8")
            source = CsvMeasurementSource(path)
            start = datetime(2024, 8, 16, 10, 30, tzinfo=timezone.utc)
            end = datetime(2024, 8, 16, 10, 34, tzinfo=timezone.utc)
            rows = source.readings(start, end)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].timestamp.isoformat(), "2024-08-16T16:02:24.182000+05:30")
            self.assertEqual(rows[0].power_kw, 1.2)
            self.assertEqual(latest_observation(source, start, end), rows[0])

    def test_detect_shortfall_and_stale(self):
        now = datetime(2024, 8, 16, 10, 35, tzinfo=timezone.utc)
        obs = Measurement(now - timedelta(minutes=1), 1.0)
        self.assertEqual(detect_shortfall(forecast_kw=2, observation=obs, now=now).status, "shortfall")
        self.assertEqual(detect_shortfall(forecast_kw=2, observation=obs, now=now + timedelta(hours=1)).status, "stale")
        self.assertEqual(detect_shortfall(forecast_kw=0, observation=obs, now=now).status, "normal")
        with self.assertRaises(ValueError):
            detect_shortfall(forecast_kw=2, observation=obs, now=now - timedelta(minutes=2))


if __name__ == "__main__":
    unittest.main()
