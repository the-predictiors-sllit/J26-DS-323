# Real-world validation without smart switches

This protocol evaluates the scheduler as a **decision-support tool**: a person follows suggested times and records what happened. There is no automatic switching or appliance telemetry. Run the controlled notebook first, then use the steps below. Obtain participant consent and follow normal electrical safety practices; do not modify wiring to collect measurements.

## 1. Decide what you can measure

| Evidence available | What you can assess | What you cannot establish from it alone |
|---|---|---|
| Scheduler outputs and participant log | Whether suggestions fit stated windows; whether people started and finished jobs as reported; time shifts and missed jobs | Exact appliance power or automatic execution |
| Timestamped inverter PV readings | Solar generation during reported operation, subject to sampling resolution | Household consumption, grid import, appliance energy or exact solar used by each appliance |
| PV plus a readable grid import meter before/after each trial period | Change in whole-house meter import over that period, if meter readings and other loads are recorded | Individual appliance consumption, or causation when other loads differ |
| PV plus suitable whole-house import/export or load meter | More complete household energy balance at the meter's time resolution | Individual appliance execution without further measurement |

Optional plug-in energy meters may help for compatible plug-in appliances, but smart switches are not required. Do not assume nameplate power equals measured power: appliance cycles and background load vary. Record sources and uncertainty for every value.

## 2. Recruit and define the trial

1. Select participating households with a working PV system and access to timestamps and inverter readings or exported data. Record site ID, PV capacity, location, inverter model, and measurement interval. Obtain consent and avoid storing names or addresses in the analysis dataset.
2. Choose the trial period and appliance list before collecting outcomes. Include appliances people can safely start manually and whose operation can be shifted without inconvenience or safety issues. Record expected duration, nominal kW, allowable window, preferred start and priority. Record which values are measured and which are estimates.
3. Specify the study objective in advance: schedule feasibility, participant adherence, usability, and, **if suitable meter data exist**, household import during a defined interval. Select outcomes, exclusions and analysis before looking at the results. Record the model version, app revision, timezone (Asia/Colombo), solar safety factor and time of forecast creation.
4. Plan an initial pilot of a few days to check the forms and data collection; do not pool pilot days into the final analysis unless this was prespecified. For a research study, use a longer prespecified period across households and weather conditions; justify sample size rather than claiming a small pilot proves general performance.

## 3. Choose a fair comparison

Use two conditions with comparable jobs and availability windows:

- **Preferred-time condition:** the participant runs each job at their usual/preferred time, within the same window. This baseline may use more grid electricity and may not meet the scheduler's solar constraint.
- **Scheduler condition:** generate a schedule before the day starts, save it, and ask the participant to start each job at its recommended time. Do not change the saved initial forecast or plan after observing the day's solar output.

Alternate conditions across days, ideally using a randomized sequence generated before the trial. Avoid comparing one sunny week with one rainy week. Record weather, actual appliance use and major unusual loads; they can still confound the comparison. If jobs differ substantially or a day is missed, record the reason and follow a prespecified exclusion rule. A paired comparison should use comparable days and jobs; do not imply the same physical day was tested twice. For robust causal claims, use a suitable randomized study design and adequate sample size.

## 4. Before each trial day

1. Record the participant's appliance jobs and availability. Generate the schedule using the forecast available at that time. Save the full input, forecast, timestamp, proposed plan, solver status and any infeasibility reason. Record if the day has no jobs. The application is solar-only and requires every active job; it does not promise feasibility or control a grid/battery.
2. For a baseline day, save the same jobs and preferred starts. Ask the participant to follow the condition assigned for that day.
3. If available, record grid import meter readings at a consistent defined start and end time for **both** conditions. Note meter units, resolution, meter identifiers and any known reset. Also record export separately if the meter exposes it. Do not subtract inverter output from import and call the result an appliance measurement.

## 5. During the day: manual operation and log

The participant manually starts each appliance at the assigned time, or records why they could not. For every job, enter the planned start, actual start, actual finish, whether it completed, any interruption, and reason for delay or cancellation. Use a clock synchronized to Sri Lanka time. A participant log is **self-reported**, not verified telemetry. Ask for timestamps as soon as events happen rather than relying on end-of-day memory.

Collect timestamped inverter readings independently, including gaps and the times readings were captured. If only a display is available, agree on a regular sampling interval and note that sparse point readings can miss short solar drops. Note other significant household activities and unusual events. Do not ask a participant to pause or interrupt an appliance for an experiment if doing so is unsafe or impractical.

For dynamic replay, record any proposed schedule change, time it was issued, what the participant actually did, and the data available at that moment. The current dynamic component is an offline replay; without a working live monitoring and notification flow, evaluate its suggestions retrospectively and do not describe it as live automatic rescheduling.

## 6. End-of-day checks and data quality

1. Save the original plan, manual event log, PV export or readings, and any meter readings with the same site ID and date. Record missing values and corrections rather than silently filling them.
2. Check timestamp offsets, units, duplicate rows, missing intervals and alignment of forecast and measurements. Define the permissible gap and interval aggregation **before** analysis. Exclude or flag periods without adequate coverage; do not interpolate over long gaps and claim uninterrupted solar-only operation.
3. Flag deviations such as unavailable participant, changed jobs, failed inverter, unplanned high load, meter reset or unrecorded finish. Keep a count of eligible, excluded, infeasible, and incomplete days and state each reason.

## 7. Calculate outcomes

- **Feasibility on the forecast:** independently check each proposed job's window, duration, non-overlap where needed, household limit and forecast solar capacity, as in the notebook. Report solver status and time. This is a plan check, not proof of physical operation.
- **Adherence:** jobs reported started within a prespecified tolerance of suggested time / jobs with a suggested start; report the tolerance, denominator, missing logs and reasons. Also report the fraction reported completed and start-time differences. Do not call self-reports verified completions.
- **Participant burden:** collect a short questionnaire after each condition, such as ease of use (1–5), inconvenience (1–5), and an optional free-text reason. Report response counts and the scale, not just averages.
- **PV context:** show measured PV during reported appliance times. Without measured household and appliance power, do not claim this proves that an appliance was powered entirely by solar. Inverter PV measures generation, not direct appliance consumption.
- **Optional import comparison:** for days with reliable grid import readings, compute end minus start in kWh for the same prespecified observation period and compare matched/randomized condition days. Report differences, variability, other household loads and missing data. Whole-house import is not appliance-specific; changes are not automatically caused by the scheduler. Tariffs or monetary savings require contemporaneous tariff and billing assumptions.
- **Optional estimated shortfall:** only if explicitly useful, model loads from nominal power and reported times, compare them with suitably aggregated PV, and label the result **estimated hypothetical shortfall**. Include background-load assumptions and sensitivity ranges. Do not describe it as measured import or verified self-consumption.

Summarize per household and condition, counts and distributions. With sufficient independent households/days, report uncertainty using a method that accounts for repeated days within a household. Avoid broad claims based on a small single-site pilot.

## 8. Reporting checklist

Document recruitment and consent, dates, sites, design and assignment, number of days/jobs, appliance characteristics and data sources, forecast issue time, PV and meter coverage, missing data, deviations, all solver statuses, analysis code, and limits. Clearly distinguish controlled simulations, self-reported use, measured PV, meter measurements and model estimates. Report negative or inconclusive results as well as improvements.

## Simple log templates

Copy these headers to a spreadsheet or CSV, one row per job or reading. Use ISO dates and local times with offset `+05:30`.

**Daily plan:** `site_id,date,condition,forecast_issued_at,job_id,power_kw_source,power_kw_estimate,duration_minutes,earliest_start,latest_finish,preferred_start,planned_start,solver_status,notes`

**Participant job log:** `site_id,date,job_id,planned_start,reported_start,reported_finish,reported_completed,interrupted,reason,notes`

**Meter log (optional):** `site_id,date,period_start,period_end,import_start_kwh,import_end_kwh,export_start_kwh,export_end_kwh,meter_type,notes`

**PV readings:** `site_id,timestamp,pv_kw,source,sampling_interval_minutes,quality_note`
