export const MODELS = {
  "5": { label: "5 minutes", endpoint: "predictinput", weatherEndpoint: "predictweather", interval: 5 },
  "15": { label: "15 minutes", endpoint: "predictinput15min", weatherEndpoint: "predictweather15min", interval: 15 },
} as const;

export type Model = keyof typeof MODELS;
export const START_MINUTES = 6 * 60;
export const END_MINUTES = 19 * 60;

export const FIELDS = [
  { name: "latitude", label: "Latitude", unit: "° N", value: "6.2353", min: -90, max: 90, group: "site" },
  { name: "longitude", label: "Longitude", unit: "° E", value: "80.055", min: -180, max: 180, group: "site" },
  { name: "pv_capacity_kwp", label: "Installed capacity", unit: "kWp", value: "15", min: 0.001, max: undefined, group: "site" },
  { name: "weather_temperature_c", label: "Temperature", unit: "°C", value: "28.6", min: undefined, max: undefined, group: "weather" },
  { name: "weather_relative_humidity_pct", label: "Relative humidity", unit: "%", value: "78", min: 0, max: 100, group: "weather" },
  { name: "weather_wind_speed_ms", label: "Wind speed", unit: "m/s", value: "0.8", min: 0, max: undefined, group: "weather" },
  { name: "weather_ghi_instant_wm2", label: "Global horizontal · GHI", unit: "W/m²", value: "415.8", min: 0, max: undefined, group: "irradiance" },
  { name: "weather_dni_instant_wm2", label: "Direct normal · DNI", unit: "W/m²", value: "794.5", min: 0, max: undefined, group: "irradiance" },
  { name: "weather_dhi_instant_wm2", label: "Diffuse horizontal · DHI", unit: "W/m²", value: "107.5", min: 0, max: undefined, group: "irradiance" },
  { name: "weather_cloud_cover_pct", label: "Total cloud cover", unit: "%", value: "100", min: 0, max: 100, group: "clouds" },
  { name: "weather_cloud_cover_low_pct", label: "Low clouds", unit: "%", value: "8", min: 0, max: 100, group: "clouds" },
  { name: "weather_cloud_cover_mid_pct", label: "Mid clouds", unit: "%", value: "0", min: 0, max: 100, group: "clouds" },
  { name: "weather_cloud_cover_high_pct", label: "High clouds", unit: "%", value: "99", min: 0, max: 100, group: "clouds" },
  { name: "weather_preceding_hour_precipitation_mm", label: "Precipitation", unit: "mm", value: "0", min: 0, max: undefined, group: "rain" },
  { name: "weather_preceding_hour_rain_mm", label: "Rain", unit: "mm", value: "0", min: 0, max: undefined, group: "rain" },
] as const;

export type FieldName = (typeof FIELDS)[number]["name"];
export type Values = Record<FieldName, string>;
export type Prediction = {
  timestamp: string;
  predicted_W_per_kWp: number;
  pv_capacity_kwp: number;
  predicted_W: number;
  predicted_power_kw: number;
};
export type PredictionState = {
  requestKey?: string;
  error?: string;
  predictions?: Prediction[];
  source?: string;
  model?: Model;
};

export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export type Submission = {
  model: Model;
  source: "manual" | "forecast" | "historical";
  period: "single" | "range";
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  values: Values;
  manualRows: Record<string, Values>;
};

export function addDays(date: string, count: number) {
  return new Date(dateNumber(date) + count * 86_400_000).toISOString().slice(0, 10);
}

function dateNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid calendar date.");
  return parsed.getTime();
}

export function schedule(input: Submission): string[] {
  if (input.model !== "5" && input.model !== "15") throw new Error("Choose a supported model.");
  if (input.period !== "single" && input.period !== "range") throw new Error("Choose a single time or a range.");
  const first = dateNumber(input.startDate);
  const last = dateNumber(input.period === "single" ? input.startDate : input.endDate);
  const endTime = input.period === "single" ? input.startTime : input.endTime;
  if (!timeOptions(input.model).includes(input.startTime) || !timeOptions(input.model).includes(endTime)) throw new Error(`Select times from 06:00–19:00 in ${input.model}-minute steps.`);
  if (first > last || (last - first) / 86_400_000 >= 31) throw new Error("Choose an ordered date range of at most 31 days.");
  if (input.startTime > endTime) throw new Error("The daily end time must be at or after the start time.");
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const firstMinute = minutes(input.startTime);
  const lastMinute = minutes(endTime);
  const count = ((last - first) / 86_400_000 + 1) * ((lastMinute - firstMinute) / MODELS[input.model].interval + 1);
  if (count > 1000) throw new Error("Choose a smaller range: at most 1,000 prediction slots.");
  const times: string[] = [];
  for (let day = first; day <= last; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    for (let minute = firstMinute; minute <= lastMinute; minute += MODELS[input.model].interval) times.push(`${date}T${timeLabel(minute)}:00+05:30`);
  }
  return times;
}

export function prepareSubmission(input: Submission, today: string) {
  const times = schedule(input);
  if (!["manual", "forecast", "historical"].includes(input.source)) throw new Error("Choose a weather source.");
  if (input.source === "forecast" && (times[0].slice(0, 10) < today || times.at(-1)!.slice(0, 10) > addDays(today, 15))) throw new Error(`Forecast dates must be ${today} through ${addDays(today, 15)}.`);
  if (input.source === "historical" && (times[0].slice(0, 10) < "1940-01-01" || times.at(-1)!.slice(0, 10) > today)) throw new Error("Historical dates must be from 1940-01-01 through today.");
  function readValues(values: Values | undefined, site: boolean, context = "") {
    const output: Record<string, number> = {};
    for (const field of FIELDS.filter((field) => (field.group === "site") === site)) {
      const raw = values?.[field.name];
      if (typeof raw !== "string" || !raw.trim() || !Number.isFinite(Number(raw))) throw new Error(`${context}Enter ${field.label.toLowerCase()}.`);
      const value = Number(raw);
      if (field.min !== undefined && value < field.min || field.max !== undefined && value > field.max) throw new Error(`${context}${field.label} is outside its allowed range.`);
      output[field.name] = value;
    }
    return output;
  }
  const site = readValues(input.values, true);
  if (input.source !== "manual") return {
    times, endpoint: MODELS[input.model].weatherEndpoint,
    payload: {
      ...site, weather_source: input.source,
      start_date: input.startDate, end_date: input.period === "single" ? input.startDate : input.endDate,
      start_time: input.startTime, end_time: input.period === "single" ? input.startTime : input.endTime,
    },
  };
  return {
    times, endpoint: MODELS[input.model].endpoint,
    payload: times.map((timestamp) => ({
      ...site, timestamp,
      ...readValues(input.period === "single" ? input.values : input.manualRows?.[timestamp], false, `${timestamp.slice(0, 16)}: `),
    })),
  };
}

export function timeOptions(model: Model) {
  return Array.from(
    { length: (END_MINUTES - START_MINUTES) / MODELS[model].interval + 1 },
    (_, index) => timeLabel(START_MINUTES + index * MODELS[model].interval),
  );
}

export function requestKey(model: string, date: string, time: string, values: Record<string, string>) {
  return JSON.stringify([model, date, time, ...FIELDS.map((field) => values[field.name])]);
}
