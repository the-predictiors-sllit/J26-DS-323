export type Profile = "savings" | "balanced" | "resilience";
export type Condition = "sunny" | "cloudy" | "rainy";

export interface Settings {
  profile: Profile;
  buy: number;
  sell: number;
  batteryKwh: number;
  pvKwp: number;
  dailyKwh: number;
  socPct: number;
  month: number;
  startHour: number;
  isWeekend: boolean;
  place: string;
  lat: number;
  lon: number;
  useForecast: boolean;
}

export interface WeatherEvt {
  startIn: number;
  duration: number;
  condition: Condition;
}

export interface OutageEvt {
  startIn: number;
  duration: number;
}

export interface PlanHour {
  hour: number;
  action: string;
  battery_kwh: number;
  soc_pct_end: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  unserved_critical_kwh: number;
}

export interface CompareRow {
  label: string;
  unserved_critical_kwh: number;
  hours_lost: number;
  grid_cost_lkr: number;
  soc_pct: number[];
}

export interface AutoPlan {
  profile: Profile;
  hour_of_day: number[];
  pv_forecast_kwh: number[];
  load_forecast_kwh: number[];
  outage_forecast: number[];
  battery_kwh: number;
  pv_kwp: number;
  plan: {
    profile: Profile;
    hours: PlanHour[];
    summary: {
      expected_unserved_critical_kwh: number;
      expected_grid_import_kwh: number;
      expected_grid_export_kwh: number;
    };
  };
  comparison: {
    plain_rule: CompareRow;
    reserve_rule: CompareRow;
    mpc: CompareRow;
  };
  notes: string[];
  weather_source: "open-meteo" | "typical";
  forecast_hours?: ForecastHour[];
}

export interface ForecastHour {
  hour_of_day: number;
  label: Condition;
  cloud_pct: number;
  rain_mm: number;
  temp_c: number;
  ghi_wm2: number;
  pv_kwh_per_kwp: number;
}

export interface Forecast {
  source: string;
  start: string;
  month: number;
  is_weekend: boolean;
  hours: ForecastHour[];
}

export interface EvalRow {
  controller: string;
  scenario: string;
  household: string;
  outages_known_in_advance: string | boolean;
  hours_lost_critical_per_year: number;
  unserved_kwh_per_year: number;
  grid_cost_lkr_per_year: number;
  outage_hours_per_year?: number;
  savings_vs_rule_lkr?: number;
}

export interface Evaluation {
  controllers: EvalRow[];
  reserve_rules: EvalRow[];
}

export interface LogEntry {
  time: string;
  profile: Profile;
  outageHours: number;
  unservedKwh: number;
  ruleUnservedKwh: number;
  note: string;
}
