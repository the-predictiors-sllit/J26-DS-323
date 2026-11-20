# Historical dynamic replay: implementation and usage

## Run it

1. Install and start the existing FastAPI backend and Next.js frontend. The 5-minute model and its metadata must be installed under `solar_prediction/models/5min/`. Open-Meteo must be reachable.
2. The default CSV is `Application/Backend/app/data/smart_scheduling/meepe.csv`. It contains only `dataTimestamp` (Unix milliseconds UTC) and `pac` (assumed AC watts) from the supplied file; it omits inverter IDs and unrelated columns. Keep the file available on each backend installation. To use another CSV, set the **process environment variable** before starting FastAPI in PowerShell:

   ```powershell
   $env:SOLAR_REPLAY_CSV = "C:\path\to\inverter.csv"
   ```

   The app does not automatically read a `.env` file for this setting. Omitting the variable uses the included sample. A replacement file must have the same columns and use this site's coordinates or the code must be adapted to configure its location. The default sample is a research input; check data-sharing permission before committing or publishing it.
3. Open Smart Scheduling → **Dynamic Replay**. Add appliances on the existing appliance-library page first. Daily/weekday/once recurrence is applied to the selected historical date: a one-time job on a different date will not run.
   The Solar Scheduler also has a **Historical weather** mode if you need to set its 14-day date window or configure one-time appliance dates in 2024. Dynamic Replay builds its own initial schedule using its own historical date and the shared appliances/settings; it does not import the Solar Scheduler's generated result.
4. Choose a date with coverage, enter the **actual installed PV capacity** for the Meepe site (the default 5 kWp is only a placeholder), set thresholds and choose whether to apply changes in the simulation or detect only. The usable solar fraction, household limit and background load come from your existing scheduler settings. A positive background load can make the entire solar-only day infeasible around sunrise or sunset.
5. Run the replay. Playback is precomputed by the backend then animated locally: it is not a real-time service. Use pause, reset and speed controls. In detect-only mode, the latest proposal is shown without changing the plan; to compare applying proposals, rerun in apply mode. This is not interactive per-event acceptance.

## Method

* Site coordinates are 5.9977, 80.2958, taken from the input CSV. `dataTimestamp` is converted from UTC to Asia/Colombo; the pre-existing `time` column is not converted again.
* Historical Open-Meteo **reanalysis** is passed to the existing 5-minute prediction model. The minimum of each three predictions supplies one 15-minute slot. This uses retrospective weather and is **not a true day-ahead prediction**. The training and evaluation dates/site may overlap, which must be checked before research claims.
* At each 15-minute boundary, the most recent inverter reading at or before that boundary, at most 10 minutes old, is used. Nothing is rounded forward and future readings are never used by the rescheduling logic. Missing/stale observations remain unavailable. `pac` values are assumed to be watts; confirm units, device quality states and whether it represents solar AC generation.
* A trigger needs both the absolute and relative shortfall thresholds, and a predicted minimum of 0.2 kW. The implementation has a one-hour cooldown. These values are illustrative, not validated. At a trigger, a simple ratio between latest observation and prediction adjusts only the next hour of the forecast, bounded to 0–1. This is a heuristic, not a validated forecast update.
* The MILP holds already-started jobs fixed, keeps their remaining load, and schedules pending noninterruptible jobs within their windows; it minimizes priority-weighted movement from initial starts. If no solution is proven or the fixed load alone exceeds the revised forecast, it retains the prior plan and warns. This does not resolve an actual physical deficit and cannot control a real appliance.
* The displayed comparison assumes each available point reading persists for 15 minutes; it is an estimated kWh shortfall, **not measured energy**, and excludes missing slots. It is not a cost, savings or proof of actual grid-free operation. The backend precomputes all frames but each decision uses only measurements up to its simulated time.

## Replace simulation later

The measurement dependency is `ObservationSource.read_day` in `dynamic/service.py`; `CsvObservationSource` is one adapter. The optimizer accepts a forecast frame separately from the source. A live implementation needs a separate time-stamped streaming adapter, durable plans and execution states, background monitoring, concurrency/authentication, explicit appliance acknowledgments, stale-data handling, real forecast issue times and a control/approval policy. The current in-memory replay should not be exposed as live control. Preserve explicit running/completed states rather than inferring real appliance execution from a clock.

## Open-Meteo options

The [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) provides reanalysis. The [Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api) provides fixed-lead archived forecasts, and the [Single Runs API](https://open-meteo.com/en/docs/single-runs-api) preserves run issue time. In a test of previous-day values for this location and date, low/mid/high cloud cover and rain were missing; those are required by this trained model. Do not silently fill them from future reanalysis and present the output as a genuine day-ahead forecast. Investigate appropriate archived runs and a defensible missing-data strategy before using results for forecast validation.
