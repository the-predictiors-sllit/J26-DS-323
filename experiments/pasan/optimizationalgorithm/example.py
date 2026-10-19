import json
# pyrefly: ignore[missing-import]
from .solar_scheduler import optimize_appliance_schedule

solar = {9: 1.0, 10: 2.0, 11: 1.5}
appliances = {
    "washing_machine": {"power_kw": .5, "duration_minutes": 120, "earliest_start": "09:00", "latest_finish": "12:00", "preferred_start": "09:00", "priority": 2},
    "water_pump": {"power_kw": .8, "duration_minutes": 60, "earliest_start": "09:00", "latest_finish": "12:00", "preferred_start": "09:00", "priority": 3},
    "electric_iron": {"power_kw": 1., "duration_minutes": 60, "earliest_start": "10:00", "latest_finish": "12:00", "preferred_start": "10:00", "priority": 1},
}
settings = {"solar_safety_factor": 1., "background_load_kw": 0., "max_household_power_kw": None}

if __name__ == "__main__":
    result = optimize_appliance_schedule(solar, appliances, settings)
    assert result["status"] == "optimal"
    assert result["evaluation"]["weighted_start_penalty"] == 120
    assert result["evaluation"]["peak_household_kw"] == 1.5
    assert abs(result["evaluation"]["appliance_energy_kwh"] - 2.8) < 1e-6
    print(json.dumps(result, indent=2))
    impossible = optimize_appliance_schedule({9: .1, 10: .1, 11: .1}, appliances, settings)
    assert impossible["status"] == "infeasible"
    # A second successful call checks that model state is not reused accidentally.
    again = optimize_appliance_schedule(solar, appliances, settings)
    assert again["status"] == "optimal"
    print("Checks passed: example optimum, infeasible request, and independent repeated calls.")
