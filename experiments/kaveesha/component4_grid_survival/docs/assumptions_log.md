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
