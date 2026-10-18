"use server";

import { type Job, type Request } from "./types";

const base = () => {
  const backend = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const api = (process.env.SOLAR_API_BASE_URL ?? `${backend}/api/v1/smartscheduling`).replace(/\/$/, "");
  return `${api}/scheduler`;
};

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail)) return body.detail.slice(0, 3).map((item: { msg?: string; loc?: (string | number)[] }) => `${item.loc?.join(" → ")}: ${item.msg}`).join(". ");
  return `Backend request failed (${response.status}).`;
}

export async function startScheduler(payload: Request): Promise<{ job_id?: string; error?: string }> {
  try {
    const response = await fetch(`${base()}/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { error: await errorMessage(response) };
    const body = await response.json();
    if (typeof body.job_id !== "string" || !/^[a-f0-9-]{36}$/.test(body.job_id)) return { error: "The backend returned an invalid job ID." };
    return { job_id: body.job_id };
  } catch { return { error: "Cannot reach the backend. Check FastAPI and BACKEND_URL." }; }
}

export async function pollScheduler(id: string): Promise<Job> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return { job_id: id, status: "failed", error: "Invalid job ID." };
  try {
    const response = await fetch(`${base()}/jobs/${id}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { job_id: id, status: "failed", error: await errorMessage(response) };
    const body: Job = await response.json();
    if (!["queued", "running", "completed", "failed"].includes(body.status)) return { job_id: id, status: "failed", error: "Invalid backend job status." };
    return body;
  } catch { return { job_id: id, status: "running", message: "Connection interrupted. Retrying…" }; }
}
