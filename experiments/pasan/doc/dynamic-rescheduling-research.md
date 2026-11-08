# Deviation-driven solar-only rescheduling: research notes

## Problem and scope

The existing plan uses forecast solar power. Actual generation can fall below the forecast after the plan is made. The research question is whether detecting that shortfall and re-optimizing *not-yet-started* appliance jobs reduces realized solar shortfall, while respecting appliance windows and limiting schedule changes, compared with retaining the original plan. The current model contains neither battery nor grid supply. A modeled shortfall does not imply a physical disconnection from the grid.

The proposed evaluation concerns this system, its Sri Lankan data and its selected appliances. Rolling-horizon home energy management and event-triggered rescheduling are already published techniques. This is a contextual research question, not evidence that the idea is novel. A systematic literature review is required before asserting any wider gap or novelty.

Related work: [Automatic optimal multi-energy management of smart homes](https://link.springer.com/article/10.1186/s42162-022-00253-0) uses 15-minute rolling-horizon optimization; [Threshold-Based Algorithms for an Online Rolling Horizon Framework Under Uncertainty](https://arxiv.org/abs/2311.11307) studies threshold-based rolling horizons. Their scope differs from this solar-only household experiment.

## Data and limitations

The supplied Meepe inverter CSV has 486 records across 16–20 August 2024; its first and last days are partial. The Unix-millisecond `dataTimestamp` for the first record corresponds to 2024-08-16 10:32:24.182 UTC and 16:02:24.182 Asia/Colombo, matching its `timeStr` label. The `time` column is therefore already local in that row: do not convert it from UTC a second time. Confirm the full dataset's provenance and column semantics before generalizing.

The adapter currently assumes `pac` is inverter AC power in watts and divides by 1000. Confirm the device specification, actual site/capacity, missing readings, quality flags and any curtailment before using it as ground truth. These point observations do not by themselves establish 15-minute mean power. Do not compare measurements from Meepe with another installation's forecast as if they were the same system. Past measurements cannot be matched to the application's current 14-day forecast.

For valid historical evaluation, obtain archived, issue-time forecasts for the *same* site and day, or explicitly label a controlled simulated forecast as synthetic. Historical weather or forecasts generated retrospectively with realized weather are not necessarily available at the original decision time. Never expose future measured values to the controller; future values are available only to the offline evaluator after its decisions.

## Design and research direction

1. Save an initial plan and its issue-time forecast, appliance constraints, settings and site identity.
2. Obtain timestamped measurements through a replaceable source interface and reject stale or mismatched data.
3. Compare aligned forecast and observed power; thresholds, persistence and cooldown are parameters to validate, not established physical constants.
4. If a trigger occurs, preserve explicitly confirmed completed and noninterruptible running jobs; reserve their remaining power. Re-optimize eligible pending jobs against a forecast updated using only information available at that time. Penalize changes from the original plan. Do not infer real job execution solely from scheduled time.
5. Explicitly report infeasibility, missing observations, forecast uncertainty and unavoidable current deficits. Never silently claim a physical appliance was controlled.

The application now contains an experimental historical replay that implements fixed started jobs, pending-job rescheduling and a penalty for changes from the original plan. It uses one-sample triggers, a cooldown, and a simple short-term correction, not a validated forecast update. It simulates job execution and provides no live control. See `dynamic-replay-implementation.md` for details and limitations. Independent validation against true issue-time forecasts remains necessary.
