export const MODELS = {
  "5": { label: "5 minutes", endpoint: "predictinput", interval: 5 },
  "15": { label: "15 minutes", endpoint: "predictinput15min", interval: 15 },
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
  predicted_W_per_kWp: number;
  pv_capacity_kwp: number;
  predicted_W: number;
  predicted_power_kw: number;
};
export type PredictionState = {
  requestKey?: string;
  error?: string;
  prediction?: Prediction;
  timestamp?: string;
  model?: Model;
};

export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
