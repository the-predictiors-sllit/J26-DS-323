import unittest
import pandas as pd
from .optimizer import ApplianceJob, solve_solar_only
from ..dynamic.optimizer import revise


class PartialScheduleTests(unittest.TestCase):
    def test_high_priority_wins_competing_slot(self):
        solar = pd.DataFrame({"timestamp": pd.date_range("2024-08-17 09:00", periods=4, freq="15min", tz="Asia/Colombo").astype(str), "solar_kw": [1.0] * 4})
        jobs = [ApplianceJob("low", 1, 60, "09:00", "10:00", "09:00", 1),
                ApplianceJob("high", 1, 60, "09:00", "10:00", "09:00", 5)]
        result = solve_solar_only(solar, jobs, safety_factor=1, allow_partial=True)
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(set(result["starts"]), {"high"})
        self.assertEqual(result["unscheduled"], ["low"])

    def test_unschedulable_window_does_not_block_other_jobs(self):
        solar = pd.DataFrame({"timestamp": pd.date_range("2024-08-17 09:00", periods=4, freq="15min", tz="Asia/Colombo").astype(str), "solar_kw": [1.0] * 4})
        jobs = [ApplianceJob("early", 1, 60, "06:00", "08:00", "06:00", 5),
                ApplianceJob("fits", 1, 60, "09:00", "10:00", "09:00", 1)]
        result = solve_solar_only(solar, jobs, safety_factor=1, allow_partial=True)
        self.assertEqual(set(result["starts"]), {"fits"})
        self.assertEqual(result["unscheduled"], ["early"])

    def test_rescheduling_keeps_higher_priority_when_both_cannot_fit(self):
        frame = pd.DataFrame({"timestamp": pd.date_range("2024-08-17 09:00", periods=4, freq="15min", tz="Asia/Colombo"), "solar_kw": [1.0] * 4, "base_load_kw": [0.0] * 4})
        jobs = [ApplianceJob("low", 1, 60, "09:00", "10:00", "09:00", 1),
                ApplianceJob("high", 1, 60, "09:00", "10:00", "09:00", 5)]
        result = revise(frame, jobs, {"low": 0, "high": 0}, {"low": 0, "high": 0}, 0, 1.0, None, allow_partial=True)
        self.assertEqual(result, {"high": 0})


if __name__ == "__main__":
    unittest.main()
