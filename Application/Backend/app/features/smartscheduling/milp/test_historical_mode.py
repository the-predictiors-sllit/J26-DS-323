import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

import numpy as np
import pandas as pd
from pydantic import ValidationError

from .schemas import SchedulerRequest, TZ
from ..solar_prediction.forecast import prepare_forecast_slots


def payload():
    return {"latitude": 5.9977, "longitude": 80.2958, "pv_capacity_kwp": 5,
            "start_date": "2024-08-17", "weather_mode": "historical",
            "appliances": [{"id": "pump", "name": "Pump", "power_kw": 0.8,
              "duration_minutes": 60, "earliest_start": "09:00", "latest_finish": "15:00",
              "preferred_start": "10:00", "priority": 2}]}


class HistoricalModeTests(unittest.TestCase):
    def test_date_validation_and_forecast_default(self):
        request = SchedulerRequest(**payload())
        self.assertEqual(request.weather_mode, "historical")
        invalid = payload()
        invalid["start_date"] = datetime.now(TZ).date().isoformat()
        with self.assertRaises(ValidationError):
            SchedulerRequest(**invalid)
        current = payload()
        current.pop("weather_mode")
        current["start_date"] = (datetime.now(TZ).date() + timedelta(days=1)).isoformat()
        self.assertEqual(SchedulerRequest(**current).weather_mode, "forecast")

    def test_historical_provider_and_15_minute_slots(self):
        times = pd.date_range("2024-08-17 06:00", "2024-08-30 19:00", freq="15min", tz=TZ)
        times = times[(times.hour >= 6) & (times.hour <= 19)]
        weather = pd.DataFrame({"timestamp": times.map(lambda value: value.isoformat())})
        def predict(rows, **kwargs):
            return pd.DataFrame({"predicted_power_kw": np.ones(len(rows))})
        with patch("app.features.smartscheduling.solar_prediction.forecast.load_prediction_model"), \
             patch("app.features.smartscheduling.solar_prediction.forecast.get_historical_weather", return_value=weather) as historical, \
             patch("app.features.smartscheduling.solar_prediction.forecast.get_forecast_weather") as forecast, \
             patch("app.features.smartscheduling.solar_prediction.forecast.predict_solar_power", side_effect=predict):
            slots = prepare_forecast_slots(latitude=5.9977, longitude=80.2958, pv_capacity_kwp=5,
                start_date=date(2024, 8, 17), prediction_model_minutes=15, weather_mode="historical")
        historical.assert_called_once()
        forecast.assert_not_called()
        self.assertEqual(len(slots), 14 * 52)
        self.assertEqual(str(slots.timestamp.iloc[0]), "2024-08-17 06:00:00+05:30")


if __name__ == "__main__":
    unittest.main()
