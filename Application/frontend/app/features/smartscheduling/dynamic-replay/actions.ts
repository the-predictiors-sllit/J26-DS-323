"use server";

import type { Appliance, Run } from "../_milp/types";

export type Frame = { timestamp: string; predicted_kw: number; actual_kw: number | null; measurement_age_seconds: number | null; original_load_kw: number; revised_load_kw: number; event: string | null; outcome: string | null; before_schedule: Run[] | null; after_schedule: Run[] | null; unscheduled: { appliance_id: string; name: string }[]; proposed_unscheduled: { appliance_id: string; name: string }[]; detection: { method: string; observed_kw: number | null; predicted_kw: number | null; shortfall_kw: number | null; samples: number; reason: string; threshold_met: boolean; cooldown_remaining_minutes: number }; proposal: Run[] | null; schedule: Run[] };
export type Replay = { status: string; date?: string; reason?: string; initial_plan_source?: "saved_14_day_plan" | "generated_for_replay"; original_schedule?: Run[]; initial_unscheduled?: { appliance_id: string; name: string }[]; frames: Frame[]; warnings?: string[] };
export type Payload = { day: string; latitude: number; longitude: number; pv_capacity_kwp: number; solar_safety_factor: number; background_load_kw: number; max_household_power_kw: number | null; threshold_kw: number; threshold_ratio: number; apply_rescheduling: boolean; detection_method: "latest" | "recent_average" | "recent_average_60"; appliances: Appliance[]; initial_plan?: { slots: { timestamp: string; solar_kw: number }[]; schedule: { appliance_id: string; start: string }[] } };
const endpoint = () => `${(process.env.SOLAR_API_BASE_URL ?? `${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/api/v1/smartscheduling`).replace(/\/$/, "")}/dynamic-replay`;
async function message(response: Response) {
  const data = await response.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : `Backend request failed (${response.status}).`;
}
export async function getReplayDates(): Promise<{ dates: string[]; error?: string }> {
  try {
    const r = await fetch(`${endpoint()}/dates`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : { dates: [], error: await message(r) };
  } catch { return { dates: [], error: "Cannot reach the backend or read the historical CSV." }; }
}
export async function runReplay(payload: Payload): Promise<{ result?: Replay; error?: string }> {
  try {
    const r = await fetch(`${endpoint()}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(180000) });
    return r.ok ? { result: await r.json() } : { error: await message(r) };
  } catch { return { error: "Replay could not be completed. Check the backend, model files, and Open-Meteo connection." }; }
}
