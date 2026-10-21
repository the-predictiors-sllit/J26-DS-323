# Assumptions log - Component 4

| # | Assumption | Why | Where used |
|---|---|---|---|
| 1 | Battery round-trip efficiency 0.95 | Not measured in any log | config battery |
| 2 | Max discharge 3.0 kW | Hardware limit is about 5 kW, real log never passed 3.05 kW | config battery |
| 3 | Tariff is a user input: default buy 35, sell 22 LKR per kWh | Rates differ by scheme | config tariff, get_plan |
| 4 | Outages are defined scenarios (mild 1.5 h, moderate 3 h, severe 5 h a day) | No public live schedule exists | src/outages.py |
| 5 | Critical load is 40 percent of household load | Fridge, lights, fans, router. Change in config | config household |
| 6 | PV size per home is calibrated to the real July 2026 log (3.1 and 6.3 kWp) | Panel size is not in the logs | config households |
| 7 | One-year load is built by resampling real days of the same home (weekday or weekend) | Only 17 to 81 days of real load exist per home | data_loader.make_load_year |
| 8 | MPC uses the true PV and load as its forecast (perfect forecast) | Upper bound. forecast_noise option tests errors | mpc.py |
| 9 | Preference profiles are unserved penalties of 5, 60 and 1000 LKR per kWh | Controls the savings versus resilience trade off | config profiles |
| 10 | Real logs cover May to August 2026 only | No dry season data | all |

## Added for the app (Component 4 frontend)
- Typical solar per kWp by month is the average hour of 2019 to 2025 NASA POWER weather run through the pvlib model (data/processed/pv_profiles_per_kwp.csv). A sunny hour uses the 90th percentile hour.
- Weather words scale a clear day's solar: sunny 100%, cloudy 50%, rainy 15%. These factors are ASSUMPTIONS, not measured.
- User weather and outage inputs are written as "starts in N hours, lasts D hours" and are treated as known when the plan is made.
- Home use for the next 24 hours is the average weekday or weekend profile from the real household logs, scaled to the daily kWh the user enters.
- When the user picks a different battery size, charge and discharge power limits scale with it (same C-rate as the 5 kWh reference battery). ASSUMPTION.
- The day comparison runs three controllers (normal rule, rule with the preference's reserve, MPC) over the same 24 hours with the same physics.
- Year results shown in the app are read from results/evaluation_summary.csv and results/rule_reserve_baselines.csv. Outage years are synthetic scenarios.

## Live weather forecast (Open-Meteo)
- Source: Open-Meteo forecast API, hourly values for the chosen place. No key needed for non-commercial use. Commercial use needs a paid plan.
- Variables used: shortwave_radiation, direct_normal_irradiance, diffuse_radiation, temperature_2m, wind_speed_10m, cloud_cover, precipitation.
- Open-Meteo values are the mean of the PRECEDING hour, so plan hour [h, h+1) uses the value stamped h+1.
- Sunlight is turned into solar energy per kWp with the same pvlib steps used for the typical-day profiles (tilt 10, azimuth 180, temperature loss, 0.86 system loss).
- Hour label: rainy if rain at least 0.3 mm, cloudy if cloud cover at least 60 percent, else sunny. Labels are for display only. The solar numbers come from the sunlight values.
- Manual weather entries override the forecast for the hours they cover.
- If Open-Meteo cannot be reached the planner uses the typical day and says so in the plan notes.
- Results are cached for 15 minutes per place. Load profile and typical day still come from the Weligama data.
