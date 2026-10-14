# Component 4 - Proactive Hardware-Free Grid-Survival Optimization for Solar Home Energy Systems

Decides each hour whether a solar and battery home should self-consume, export or hold energy in reserve,
so that planned outages hurt less. Hardware-free: runs on simulation, public weather data and user inputs.

## Method
- Rule-based baseline (normal self-consumption logic)
- Main method: Model Predictive Control (24 hour look-ahead, linear program, re-solved every hour)
- Secondary comparison: one PPO agent (in progress)
- Three user preferences: savings, balanced, resilience (the penalty on unserved critical load)

## Run
    pip install -r requirements.txt
    python src/fetch_weather.py        # once, saves weather_hourly.csv into data/raw/weather/
    python src/evaluate.py 365         # full year, all scenarios, writes results/evaluation_summary.csv

## Key functions
| File | Function |
|---|---|
| src/data_loader.py | load_config, load_weather, make_load_year |
| src/pv_model.py | simulate_pv |
| src/simulator.py | simulate, step_physics, summarize |
| src/baseline.py | rule_based_controller |
| src/mpc.py | solve_mpc, run_receding_horizon |
| src/plan.py | get_plan (the one function the API wraps) |

See docs/assumptions_log.md for every assumption.
