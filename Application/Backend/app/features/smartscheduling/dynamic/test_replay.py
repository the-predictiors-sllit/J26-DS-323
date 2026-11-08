import unittest
import tempfile
from datetime import date, time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

from .service import replay
from .monitoring import assess_observations
from .sources import CsvObservationSource
from .router import InitialPlan
from .optimizer import candidate_starts, fixed_load_at_slot, validate_revision
from ..milp.optimizer import ApplianceJob
from ..milp.schemas import Appliance


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.timestamps = pd.date_range("2024-08-17 06:00", periods=52, freq="15min", tz="Asia/Colombo")
        self.forecast = pd.DataFrame({"timestamp": self.timestamps, "solar_kw": 2.0})
        appliance = Appliance(id="pump", name="Pump", power_kw=0.8, duration_minutes=60,
            earliest_start=time(9), latest_finish=time(15), preferred_start=time(10), priority=2)
        self.request = SimpleNamespace(day=date(2024, 8, 17), latitude=5.9977, longitude=80.2958,
            pv_capacity_kwp=5, background_load_kw=0, solar_safety_factor=0.9,
            max_household_power_kw=None, threshold_kw=0.3, threshold_ratio=0.2,
            appliances=[appliance])

    def test_shortfall_moves_pending_job_and_not_completed_job(self):
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 2.0})
        readings.loc[15:18, "actual_kw"] = 0.3  # 09:45 through 10:30
        source = SimpleNamespace(read_day=lambda _: readings)
        result = replay(self.request, source, self.forecast)
        self.assertEqual(result["status"], "completed")
        self.assertIn("10:00", result["original_schedule"][0]["start"])
        at_trigger = result["frames"][15]
        self.assertIn("1 pending", at_trigger["event"])
        changed_start = at_trigger["schedule"][0]["start"]
        self.assertNotEqual(changed_start, result["original_schedule"][0]["start"])
        self.assertEqual(result["frames"][-1]["schedule"][0]["start"], changed_start)

    def test_no_future_or_stale_measurement_used(self):
        reading = pd.DataFrame({"timestamp": [self.timestamps[1] + pd.Timedelta(minutes=1)], "actual_kw": [0.2]})
        source = SimpleNamespace(read_day=lambda _: reading)
        result = replay(self.request, source, self.forecast)
        self.assertIsNone(result["frames"][0]["actual_kw"])
        self.assertIsNone(result["frames"][1]["actual_kw"])
        self.assertIsNone(result["frames"][2]["actual_kw"])

    def test_detect_only_shows_proposal_without_changing_plan(self):
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 2.0})
        readings.loc[15:18, "actual_kw"] = 0.3
        self.request.apply_rescheduling = False
        result = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        frame = result["frames"][15]
        self.assertIsNotNone(frame["proposal"])
        self.assertEqual(frame["schedule"], result["original_schedule"])
        self.assertNotEqual(frame["proposal"][0]["start"], frame["schedule"][0]["start"])

    def test_running_job_is_not_moved(self):
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 2.0})
        readings.loc[17:20, "actual_kw"] = 0.3  # after the 10:00 start
        result = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        self.assertEqual(result["frames"][17]["schedule"][0]["start"], result["original_schedule"][0]["start"])

    def test_recent_average_uses_only_past_samples_and_requires_coverage(self):
        now = self.timestamps[20]
        samples = pd.date_range(now - pd.Timedelta(minutes=30), now, freq="5min")
        actual = pd.DataFrame({"timestamp": list(samples) + [now + pd.Timedelta(minutes=1)],
                               "actual_kw": [1.0] * len(samples) + [99.0]})
        result = assess_observations(actual, self.forecast, now, "recent_average")
        self.assertEqual(result.samples, 7)
        self.assertEqual(result.observed_kw, 1.0)
        self.assertEqual(result.predicted_kw, 2.0)
        actual["timestamp"] = actual.timestamp.dt.as_unit("ms")
        forecast = self.forecast.copy()
        forecast["timestamp"] = forecast.timestamp.dt.as_unit("us")
        self.assertEqual(assess_observations(actual, forecast, now, "recent_average").observed_kw, 1.0)
        missing = assess_observations(actual.iloc[:2], self.forecast, now, "recent_average")
        self.assertIsNone(missing.observed_kw)

    def test_events_preserve_before_after_snapshots(self):
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 2.0})
        readings.loc[15:18, "actual_kw"] = 0.3
        result = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        event = result["frames"][15]
        self.assertEqual(event["outcome"], "changed")
        self.assertEqual(event["before_schedule"], result["original_schedule"])
        self.assertEqual(event["after_schedule"], event["schedule"])

    def test_recent_average_replay_does_not_use_later_readings(self):
        stamps = pd.date_range(self.timestamps[0], periods=156, freq="5min")
        readings = pd.DataFrame({"timestamp": stamps, "actual_kw": 2.0})
        readings.loc[(readings.timestamp >= self.timestamps[14]) & (readings.timestamp <= self.timestamps[17]), "actual_kw"] = 0.3
        self.request.detection_method = "recent_average"
        first = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        changed = readings.copy()
        changed.loc[changed.timestamp > self.timestamps[16], "actual_kw"] = 100.0
        second = replay(self.request, SimpleNamespace(read_day=lambda _: changed), self.forecast)
        self.assertEqual(first["frames"][:17], second["frames"][:17])
        self.assertTrue(any(frame["event"] for frame in first["frames"]))

    def test_hour_average_requires_hour_of_coverage_and_ignores_future(self):
        now = self.timestamps[20]
        times = pd.date_range(now - pd.Timedelta(hours=1), now, freq="5min")
        readings = pd.DataFrame({"timestamp": list(times) + [now + pd.Timedelta(minutes=5)],
                                 "actual_kw": [1.0] * len(times) + [100.0]})
        assessment = assess_observations(readings, self.forecast, now, "recent_average_60")
        self.assertEqual(assessment.samples, 13)
        self.assertEqual(assessment.observed_kw, 1.0)
        self.assertEqual(assessment.reason, "60-minute sample average")
        self.assertIsNone(assess_observations(readings.iloc[6:], self.forecast, now, "recent_average_60").observed_kw)

    def test_reusable_start_options_and_fixed_load(self):
        frame = self.forecast.assign(base_load_kw=0.2)
        job = ApplianceJob("pump", 0.8, 60, "09:00", "11:00", "09:00", 2)
        # A one-hour job fits at 09:00 through 10:00, in 15-minute steps.
        self.assertEqual(candidate_starts(frame, job, 0), [12, 13, 14, 15, 16])
        self.assertAlmostEqual(fixed_load_at_slot(frame, [job], {"pump": 12}, 13), 1.0)
        self.assertAlmostEqual(fixed_load_at_slot(frame, [job], {"pump": 12}, 16), 0.2)

    def test_validation_rejects_moved_running_job_and_excess_load(self):
        frame = self.forecast.assign(base_load_kw=0.0)
        job = ApplianceJob("pump", 0.8, 60, "09:00", "11:00", "09:00", 2)
        self.assertTrue(validate_revision(frame, [job], {"pump": 12}, {"pump": 13}, 13, 1.0, None))
        frame.loc[13, "solar_kw"] = 0.1
        self.assertTrue(validate_revision(frame, [job], {"pump": 12}, {"pump": 12}, 13, 1.0, None))

    def test_latest_reading_uses_timestamp_order(self):
        now = self.timestamps[20]
        readings = pd.DataFrame({"timestamp": [now, now - pd.Timedelta(minutes=5)], "actual_kw": [1.0, 0.1]})
        self.assertEqual(assess_observations(readings, self.forecast, now, "latest").observed_kw, 1.0)

    def test_unresolved_revision_does_not_claim_infeasible(self):
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 0.3})
        with patch("app.features.smartscheduling.dynamic.service.revise", return_value=None):
            result = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        event = result["frames"][0]
        self.assertEqual(event["outcome"], "unresolved")
        self.assertIn("solver may have stopped", event["event"])
        self.assertEqual(event["schedule"], result["original_schedule"])

    def test_no_solar_lists_unscheduled_initial_appliance(self):
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 0.0})
        self.forecast["solar_kw"] = 0.0
        result = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["initial_unscheduled"][0]["appliance_id"], "pump")

    def test_csv_rejects_missing_timestamp(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "observations.csv"
            path.write_text("dataTimestamp,pac\n,100\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing"):
                CsvObservationSource(path).read_day(self.request.day)

    def test_replay_uses_saved_plan_without_refetching_predictions(self):
        slots = [{"timestamp": stamp.isoformat(), "solar_kw": 2.0} for stamp in self.timestamps]
        self.request.initial_plan = InitialPlan(slots=slots, schedule=[{"appliance_id": "pump", "start": self.timestamps[16].isoformat()}])
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 2.0})
        with patch("app.features.smartscheduling.dynamic.service.historical_predictions") as fetch:
            result = replay(self.request, SimpleNamespace(read_day=lambda _: readings))
        fetch.assert_not_called()
        self.assertEqual(result["initial_plan_source"], "saved_14_day_plan")
        self.assertEqual(result["original_schedule"][0]["start"], self.timestamps[16].isoformat())

    def test_replay_rejects_saved_plan_exceeding_solar(self):
        slots = [{"timestamp": stamp.isoformat(), "solar_kw": 0.1} for stamp in self.timestamps]
        self.request.initial_plan = InitialPlan(slots=slots, schedule=[{"appliance_id": "pump", "start": self.timestamps[16].isoformat()}])
        readings = pd.DataFrame({"timestamp": self.timestamps, "actual_kw": 2.0})
        with self.assertRaisesRegex(ValueError, "Saved plan fails"):
            replay(self.request, SimpleNamespace(read_day=lambda _: readings))

    def test_replay_reports_lower_priority_run_it_cannot_reschedule(self):
        def appliance(identifier, priority):
            return Appliance(id=identifier, name=identifier, power_kw=0.5, duration_minutes=60,
                             earliest_start=time(10), latest_finish=time(11), preferred_start=time(10), priority=priority)
        self.request.appliances = [appliance("high", 5), appliance("low", 1)]
        readings = pd.DataFrame({"timestamp": [self.timestamps[16]], "actual_kw": [0.7]})
        result = replay(self.request, SimpleNamespace(read_day=lambda _: readings), self.forecast)
        event = result["frames"][16]
        self.assertEqual([item["appliance_id"] for item in event["schedule"]], ["high"])
        self.assertEqual([item["appliance_id"] for item in event["unscheduled"]], ["low"])
        self.assertIn("low", event["event"])


if __name__ == "__main__":
    unittest.main()
