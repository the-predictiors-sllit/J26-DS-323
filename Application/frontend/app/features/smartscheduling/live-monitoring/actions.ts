"use server";

export type LiveStatus = {
  provider: string;
  provider_implemented: boolean;
  connection_verified: boolean;
  automatic_monitoring_available: boolean;
  automatic_rescheduling_available: boolean;
  appliance_control_available: boolean;
};
export type LiveReading = { timestamp: string; power_kw: number; age_seconds: number; provider: string };
export type LiveResponse = { status?: LiveStatus; reading?: LiveReading; error?: string };

function base() {
  const backend = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  return `${(process.env.SOLAR_API_BASE_URL ?? `${backend}/api/v1/smartscheduling`).replace(/\/$/, "")}/live`;
}

export async function readLiveStatus(): Promise<LiveResponse> {
  try {
    const response = await fetch(`${base()}/status`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { error: `Could not load live status (${response.status}).` };
    const status: LiveStatus = await response.json();
    if (!status || typeof status.provider !== "string" || typeof status.provider_implemented !== "boolean") return { error: "Invalid live status from backend." };
    return { status };
  } catch { return { error: "Cannot reach FastAPI. Check that the backend is running." }; }
}

export async function readLiveMeasurement(): Promise<LiveResponse> {
  try {
    const response = await fetch(`${base()}/measurement`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    if (!response.ok) return { error: typeof body?.detail === "string" ? body.detail : `Measurement unavailable (${response.status}).` };
    if (typeof body?.power_kw !== "number" || !Number.isFinite(body.power_kw) || typeof body?.timestamp !== "string" || !Number.isFinite(body?.age_seconds)) return { error: "The backend returned an invalid measurement." };
    return { reading: body as LiveReading };
  } catch { return { error: "Could not obtain a live reading. Check the backend and provider connection." }; }
}
