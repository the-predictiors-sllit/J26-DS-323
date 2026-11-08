import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from .providers import ProviderUnavailable, SolarReading, SolisProvider
from .router import router
from .schemas import AssessmentRequest
from .service import latest_reading, preview_assessment


class FakeProvider:
    name = "test"

    def __init__(self, readings):
        self.readings = readings

    def is_implemented(self):
        return True

    def read_between(self, start, end):
        return self.readings


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2024, 8, 17, 5, 0, tzinfo=timezone.utc)

    def test_stub_remains_unavailable(self):
        self.assertFalse(SolisProvider().is_implemented())
        with self.assertRaises(ProviderUnavailable):
            latest_reading(SolisProvider(), self.now)

    def test_future_or_invalid_readings_are_rejected(self):
        provider = FakeProvider([SolarReading(self.now + timedelta(seconds=1), 1)])
        with self.assertRaises(ProviderUnavailable):
            latest_reading(provider, self.now)
        provider = FakeProvider([SolarReading(self.now, float("nan"))])
        with self.assertRaises(ProviderUnavailable):
            latest_reading(provider, self.now)

    def test_preview_compares_live_reading_and_current_forecast(self):
        provider = FakeProvider([SolarReading(self.now - timedelta(minutes=1), 1.0)])
        request = AssessmentRequest(forecast_available_at=self.now - timedelta(hours=1),
            forecast=[{"timestamp": self.now, "solar_kw": 2.0}])
        result = preview_assessment(provider, request, self.now)
        self.assertTrue(result["threshold_met"])
        self.assertEqual(result["shortfall_kw"], 1.0)
        request.forecast_available_at = self.now + timedelta(seconds=1)
        with self.assertRaises(ValueError):
            preview_assessment(provider, request, self.now)

    def test_routes_expose_unavailable_status_without_credentials(self):
        app = FastAPI()
        app.include_router(router)
        with patch("app.features.smartscheduling.live.router.get_live_provider", return_value=SolisProvider()):
            with TestClient(app) as client:
                status = client.get("/live/status")
                self.assertEqual(status.status_code, 200)
                self.assertFalse(status.json()["provider_implemented"])
                self.assertEqual(client.get("/live/measurement").status_code, 503)


if __name__ == "__main__":
    unittest.main()
