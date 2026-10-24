import type { FIELDS, MODELS } from "./config";

export type Model = keyof typeof MODELS;
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
