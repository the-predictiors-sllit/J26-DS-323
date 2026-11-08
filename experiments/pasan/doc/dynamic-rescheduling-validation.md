# Step-by-step evaluation plan

## A. Validate the existing static scheduler separately

1. Construct small hand-checkable cases with 15-minute slots, realistic appliance windows, and known feasible and infeasible answers.
2. Check every job runs exactly once, continuously, for its full duration and within its time window. Check per-slot household load, solar safety factor and household cap independently of the optimizer.
3. Check the priority objective and peak tie-breaker against an enumerated small example. Record solver status, gap, runtime and infeasibility; don't treat time-limited solutions as optimal.
4. Test repeated appliances, empty days, incomplete slot data, invalid input, and the 06:00–19:00 boundary. Evaluate additional held-out sites/days if available.

## B. Validate dynamic rescheduling separately

1. Verify epoch conversion on known rows and establish `pac` units and data quality. Reject duplicates, stale/missing data and invalid power. Assess sampling gaps and define defensible interval alignment.
2. Create a historical replay using the same site's issue-time forecast and measurements. Preserve forecast issue time and feed the controller only data that existed at each simulated decision time.
3. First test no deviation, sustained shortfall, recovery, missing/stale readings, near-zero forecast, gaps, cooldown and repeated triggers. Use labelled synthetic examples before real data.
4. Verify completed jobs never restart; a running noninterruptible job keeps its true start and remaining duration; pending jobs stay inside windows and finish exactly once. Check running load alone exceeding solar and no feasible reschedule.
5. Independently recompute per-slot load and solar deficits from realized measurements for both the static and dynamic plans. Report kWh deficit, number and duration of deficit slots, completed/missed jobs, changed starts, weighted shift, triggers and computation time. Report only metrics supported by available actual data.
6. Compare the same days and appliance inputs under a static plan, the proposed dynamic strategy and optionally a periodic-reoptimization baseline. An oracle with future measurements can be an explicitly labeled upper-bound comparison only; never use it as the operational controller.
7. Run sensitivity analyses for thresholds, persistence, cooldown, forecast update method and safety factor. Separate development and held-out evaluation dates; report small samples and site limitations. Do not claim statistical generalization from this short single-site file.

The real implementation must be completed and tested before reporting these as results. No actuator or real appliance state is available in the supplied CSV.

The historical replay prototype now exists; see `dynamic-replay-implementation.md`. Its reconstructed weather is retrospective, its appliance execution is simulated, and its prediction model may have seen the evaluation data during training. It is suitable for demonstration and software checks, but not yet an unbiased day-ahead evaluation. Establish archived forecast issue times and an independent holdout before reporting forecast or rescheduling performance.
