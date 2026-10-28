import { END_MINUTES, FIELDS, MODELS, START_MINUTES } from "../config";
import type { Model, Submission, Values } from "../types";

export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function addDays(date: string, count: number) {
  return new Date(dateNumber(date) + count * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function dateNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Choose a valid date.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose a valid calendar date.");
  return parsed.getTime();
}

export function schedule(input: Submission): string[] {
  if (input.model !== "5" && input.model !== "15")
    throw new Error("Choose a supported model.");
  if (input.period !== "single" && input.period !== "range")
    throw new Error("Choose a single time or a range.");
  const first = dateNumber(input.startDate);
  const last = dateNumber(
    input.period === "single" ? input.startDate : input.endDate,
  );
  const endTime = input.period === "single" ? input.startTime : input.endTime;
  if (
    !timeOptions(input.model).includes(input.startTime) ||
    !timeOptions(input.model).includes(endTime)
  )
    throw new Error(
      `Select times from 06:00–19:00 in ${input.model}-minute steps.`,
    );
  if (first > last || (last - first) / 86_400_000 >= 31)
    throw new Error("Choose an ordered date range of at most 31 days.");
  if (input.startTime > endTime)
    throw new Error("The daily end time must be at or after the start time.");
  const minutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const firstMinute = minutes(input.startTime);
  const lastMinute = minutes(endTime);
  const count =
    ((last - first) / 86_400_000 + 1) *
    ((lastMinute - firstMinute) / MODELS[input.model].interval + 1);
  if (count > 1000)
    throw new Error("Choose a smaller range: at most 1,000 prediction slots.");
  const times: string[] = [];
  for (let day = first; day <= last; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    for (
      let minute = firstMinute;
      minute <= lastMinute;
      minute += MODELS[input.model].interval
    )
      times.push(`${date}T${timeLabel(minute)}:00+05:30`);
  }
  return times;
}

export function prepareSubmission(input: Submission, today: string) {
  const times = schedule(input);
  if (!["manual", "forecast", "historical"].includes(input.source))
    throw new Error("Choose a weather source.");
  if (
    input.source === "forecast" &&
    (times[0].slice(0, 10) < today ||
      times.at(-1)!.slice(0, 10) > addDays(today, 15))
  )
    throw new Error(
      `Forecast dates must be ${today} through ${addDays(today, 15)}.`,
    );
  if (
    input.source === "historical" &&
    (times[0].slice(0, 10) < "1940-01-01" || times.at(-1)!.slice(0, 10) > today)
  )
    throw new Error("Historical dates must be from 1940-01-01 through today.");
  function readValues(values: Values | undefined, site: boolean, context = "") {
    const output: Record<string, number> = {};
    for (const field of FIELDS.filter(
      (field) => (field.group === "site") === site,
    )) {
      const raw = values?.[field.name];
      if (
        typeof raw !== "string" ||
        !raw.trim() ||
        !Number.isFinite(Number(raw))
      )
        throw new Error(`${context}Enter ${field.label.toLowerCase()}.`);
      const value = Number(raw);
      if (
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      )
        throw new Error(
          `${context}${field.label} is outside its allowed range.`,
        );
      output[field.name] = value;
    }
    return output;
  }
  const site = readValues(input.values, true);
  if (input.source !== "manual")
    return {
      times,
      endpoint: MODELS[input.model].weatherEndpoint,
      payload: {
        ...site,
        weather_source: input.source,
        start_date: input.startDate,
        end_date: input.period === "single" ? input.startDate : input.endDate,
        start_time: input.startTime,
        end_time: input.period === "single" ? input.startTime : input.endTime,
      },
    };
  return {
    times,
    endpoint: MODELS[input.model].endpoint,
    payload: times.map((timestamp) => ({
      ...site,
      timestamp,
      ...readValues(
        input.period === "single"
          ? input.values
          : input.manualRows?.[timestamp],
        false,
        `${timestamp.slice(0, 16)}: `,
      ),
    })),
  };
}

export function timeOptions(model: Model) {
  return Array.from(
    { length: (END_MINUTES - START_MINUTES) / MODELS[model].interval + 1 },
    (_, index) => timeLabel(START_MINUTES + index * MODELS[model].interval),
  );
}

export function requestKey(
  model: string,
  date: string,
  time: string,
  values: Record<string, string>,
) {
  return JSON.stringify([
    model,
    date,
    time,
    ...FIELDS.map((field) => values[field.name]),
  ]);
}
