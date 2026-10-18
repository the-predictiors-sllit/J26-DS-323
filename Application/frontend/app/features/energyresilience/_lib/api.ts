import type { AutoPlan, Evaluation, Forecast, OutageEvt, Settings, WeatherEvt } from "./types";

// Where the Component 4 FastAPI server runs. Change it in Application/frontend/.env.local if needed.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function planAuto(s: Settings, weather: WeatherEvt[], outages: OutageEvt[]): Promise<AutoPlan> {
  const body = {
    profile: s.profile,
    buy_lkr_per_kwh: s.buy,
    sell_lkr_per_kwh: s.sell,
    soc_pct: s.socPct,
    battery_kwh: s.batteryKwh,
    pv_kwp: s.pvKwp,
    daily_kwh: s.dailyKwh,
    month: s.month,
    start_hour: s.startHour,
    is_weekend: s.isWeekend,
    use_forecast: s.useForecast,
    lat: s.lat,
    lon: s.lon,
    weather: weather.map((w) => ({ start_in_hours: w.startIn, duration_hours: w.duration, condition: w.condition })),
    outages: outages.map((o) => ({ start_in_hours: o.startIn, duration_hours: o.duration })),
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/plan/auto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the planner at ${API_BASE}. Start it with: python -m uvicorn api.main:app --reload`);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof detail.detail === "string" ? detail.detail : "The planner rejected these inputs.");
  }
  return (await res.json()) as AutoPlan;
}

export async function getEvaluation(): Promise<Evaluation> {
  const res = await fetch(`${API_BASE}/evaluation`).catch(() => null);
  if (!res || !res.ok) throw new Error(`Cannot load the one-year results from ${API_BASE}.`);
  return (await res.json()) as Evaluation;
}

export async function getForecast(lat: number, lon: number, startHour: number): Promise<Forecast> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/weather/forecast?lat=${lat}&lon=${lon}&start_hour=${startHour}`);
  } catch {
    throw new Error(`Cannot reach the planner at ${API_BASE}.`);
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({ detail: "" }));
    throw new Error(typeof d.detail === "string" && d.detail ? d.detail : "Live forecast unavailable.");
  }
  return (await res.json()) as Forecast;
}
