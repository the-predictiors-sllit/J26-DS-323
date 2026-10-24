export type Appliance = {
  id: string;
  name: string;
  power_kw: number;
  duration_minutes: number;
  earliest_start: string;
  latest_finish: string;
  preferred_start: string;
  priority: number;
  recurrence: "daily" | "weekdays" | "once";
  weekdays: number[];
  run_date: string | null;
  enabled: boolean;
};
export type Settings = {
  latitude: number;
  longitude: number;
  pv_capacity_kwp: number;
  start_date: string;
  prediction_model_minutes: 5 | 15;
  solar_safety_factor: number;
  background_load_kw: number;
  max_household_power_kw: number | null;
};
export type Request = Settings & { appliances: Appliance[] };
export type Run = {
  appliance_id: string;
  name: string;
  start: string;
  finish_exclusive: string;
  power_kw: number;
  duration_minutes: number;
  energy_kwh: number;
};
export type Slot = {
  timestamp: string;
  solar_kw: number;
  usable_solar_kw: number;
  scheduled_total_kw: number | null;
};
export type Day = {
  date: string;
  status: "optimal" | "infeasible" | "not_proven_optimal" | "idle";
  reason?: string;
  appliance_count: number;
  schedule: Run[];
  slots: Slot[];
  metrics?: {
    valid: boolean;
    weighted_start_shift_minutes: number;
    peak_load_kw: number;
    load_energy_kwh: number;
    solve_seconds: number;
  };
};
export type Job = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: number;
  message?: string;
  error?: string;
  result?: {
    generated_at: string;
    days: Day[];
    notes: string[];
    aggregation: string;
  };
};
