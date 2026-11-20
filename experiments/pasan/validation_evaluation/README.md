# Smart scheduling: validation and evaluation

This folder evaluates the **current backend MILP** in `Application/Backend/app/features/smartscheduling/milp/optimizer.py`. It calls the real solver, not the older experimental copy. The initial results are controlled simulations, not a complete field validation of the product. The existing dynamic replay is an offline simulation, not an appliance controller.

## 1. Prepare the environment

Open PowerShell at the repository root `C:\Users\pkmpp\Documents\GitHub\J26-DS-323`. The existing `experiments/pasan/.venv` contains Python, pandas, NumPy, Pyomo and HiGHS. If it is unavailable, create an environment from `experiments/pasan/pyproject.toml` and install its dependencies, plus the backend dependencies needed for its tests. The solver requires both Pyomo and highspy.

## 2. Run the independent small-case validation

```powershell
experiments/pasan/.venv/Scripts/python.exe experiments/pasan/validation_evaluation/evaluate.py
```

Inspect `results/validation.csv`. All `pass` values should be `True`. Five cases test priority, household cap, infeasibility, the solar safety factor, and an exact deadline. For each, an exhaustive enumeration independently reconstructs load and compares the MILP's lexicographic weighted start shift and peak to the exact optimum. This is evidence for these cases, not a proof for every input. `not_proven_optimal` is distinct from infeasible and is counted as a failure in these cases. The audit reconstructs contiguous loads from the returned start indices, checks job IDs, windows, solar and household limits, and recomputes objectives.

## 3. Run existing integration and replay checks

```powershell
$env:PYTHONPATH='Application/Backend;experiments/pasan'
experiments/pasan/.venv/Scripts/python.exe -m unittest app.features.smartscheduling.milp.test_historical_mode app.features.smartscheduling.dynamic.test_replay dynamic_rescheduling.test_measurements -v
```

These use synthetic/mocked inputs: they check historical mode, 15-minute slots, triggering, detect-only mode, preservation of running jobs, stale readings, timestamps and power conversion. They do not validate live weather, real appliance execution, frontend behavior, or dynamic performance across real days. Record the test output, git revision and any local changes with your report.

## 4. Review the controlled performance experiment

The same command in step 2 writes `results/controlled_evaluation.csv` and `run_metadata.json`. It evaluates three artificial solar profiles and three safety factors using the same three example appliances. The comparison is a user-preferred-start baseline, which does not enforce the solar constraint. The synthetic realized curve contains an imposed solar drop; this is a stress test, not a measured forecast error. Runtime is solver wall time on this machine, not a scalability benchmark.

- `valid` and `violations` concern **forecast** limits and the chosen factor, not the realized profile. The baseline can violate forecast limits.
- `weighted_shift_min` is priority multiplied by absolute start deviation, summed across jobs; lower is better. `peak_kw` includes background load.
- `realized_deficit_kwh` sums positive load minus the synthetic realized solar over 15-minute slots. It is a hypothetical energy shortfall, not measured grid import or cost. `realized_deficit_slots` counts affected slots; multiply by 15 for minutes.
- `solar_used_kwh` is the sum of the lesser of load and synthetic realized generation; it is an assumed instantaneous match, not a measured self-consumption figure.
- Report feasibility/status for every scenario; do not drop infeasible or time-limited days. Compare methods only on the same inputs and report both shift and shortfall. A preferred-start baseline can have a lower shortfall in a particular scenario because the forecast is imperfect.

This script overwrites the results directory files when rerun. Copy the folder before changing scenarios if you need an immutable record. The profiles, appliances and shortfall are defined in `evaluate.py` and should be replaced or supplemented with representative, justified cases for a research evaluation.

## 5. Prepare an independent real-data evaluation

1. Define held-out sites and chronological dates before evaluating. Check the training notebooks and model metadata to establish that these sites/dates were not used to fit or tune the solar models. Save a data-split manifest, location, PV capacity, units and model version. Do not call results independent if this cannot be established.
2. Collect actual **archived, issue-time** day-ahead predictions for each 15-minute interval and contemporaneous measured PV and household load. A retrospective historical-weather prediction is not a forecast available on the day. Verify clock offsets, sampling gaps, duplicate timestamps, units and site identity; predefine resampling and minimum coverage. Use interval measurements appropriate to the load balance and disclose the aggregation method. Preserve all input files and their hashes.
3. Specify realistic appliance jobs, release times, deadlines, power, durations, priorities, recurrence and background load independently of results. Include easy, congested, low-solar, household-limit and infeasible cases. The application requires every active job to run, uses 06:00–19:00 slots, and models neither a battery nor grid dispatch.
4. Schedule each day from only the prediction available at issue time. Compare identical inputs with preferred starts and a specified feasible rule-based baseline; keep the same operating windows and count baseline violations. A perfect-knowledge schedule using future measured solar may be shown as a clearly labelled oracle, never as an operational forecast.
5. Replay each planned schedule against measured PV and base load without looking ahead. Independently reconstruct the load trace and report completed/missing jobs, window and household violations, forecast and measured shortfall kWh and minutes, weighted shift, peak load, computation time, infeasible/time-limited counts, and eligible versus excluded days. Actual completion requires appliance telemetry; otherwise label completion as simulated. Separate metrics for valid and invalid schedules. Calculate solar utilization with an explicit denominator and aggregation period.
6. For dynamic replay, compare static and dynamic plans on the same days with identical measurements, frozen thresholds and no future data. Audit each decision and running/completed job state, report missed jobs, changed starts, triggers, shortfall and runtime. Predefine handling for missing/stale observations and infeasible replans. The existing `experiments/pasan/doc/dynamic-rescheduling-validation.md` gives further cases. Report this as replay unless a live controlled trial is performed.
7. Summarize paired per-day differences, sample sizes and distributions; quantify uncertainty at the independent site/day level when the sample supports it. Run prespecified sensitivity analyses for safety factor and plausible load/forecast error; do not select parameters on the final holdout. Keep failures and exclusions visible. Do not claim energy savings, cost savings or statistical generalization without suitable measurements and a defensible comparison.

## 6. Current evidence and limitations

On this checkout the five exact controlled checks passed and the eight existing tests in step 3 passed. In the artificial cloudy case with factor 0.7, the MILP shifted starts by 135 priority-weighted minutes and had 0.453 kWh synthetic shortfall versus 0.370 kWh for preferred starts. This illustrates forecast error and a tradeoff; it does not establish typical performance. See the CSV for all cases.

The supplied `Application/Backend/app/data/smart_scheduling/meepe.csv` has 486 rows, spanning 2024-08-16 16:02 to 2024-08-20 08:06 Sri Lanka time. An initial scan found no missing values, negative `pac` values or duplicate timestamps. Only three dates have roughly full daytime coverage; the endpoint dates are partial. The backend treats `pac` as watts. The file does not establish forecast issue times, independent model holdout, actual household demand or appliance execution. Therefore it cannot by itself substantiate real-world savings, performance or unbiased dynamic evaluation. Verify its units and interval coverage before using it.

The static 14-day service and dynamic replay have different roles; the schedule service itself notes that deviation-driven monitoring is TODO. There is no claim here that a live control loop or end-to-end production deployment has been validated. Extend the test matrix to malformed/partial data, all recurrence cases, solver timeouts, API/frontend, and larger workloads before deployment.
