"use server";

import { FIELDS, MODELS, requestKey, timeOptions, type Model, type Prediction, type PredictionState } from "./config";

export async function predictSolar(
  _previous: PredictionState,
  formData: FormData,
): Promise<PredictionState> {
  const model = String(formData.get("model") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const values = Object.fromEntries(FIELDS.map(({ name }) => [name, String(formData.get(name) ?? "")]));
  const key = requestKey(model, date, time, values);
  const fail = (error: string): PredictionState => ({ requestKey: key, error });

  if (model !== "5" && model !== "15") return fail("Select a supported prediction model.");
  if (!timeOptions(model).includes(time)) {
    return fail(`Choose a time from 06:00 to 19:00 in ${model}-minute steps.`);
  }
  // Round-trip validation rejects nonexistent dates such as 2026-02-29.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Select a valid date.");
  const checkDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(checkDate.getTime()) || checkDate.toISOString().slice(0, 10) !== date) {
    return fail("Select a valid calendar date.");
  }

  const payload: Record<string, string | number> = {
    timestamp: `${date}T${time}:00+05:30`,
  };

  for (const field of FIELDS) {
    const raw = values[field.name].trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) return fail(`Enter a valid ${field.label.toLowerCase()}.`);
    if (field.min !== undefined && value < field.min) return fail(`${field.label} must be at least ${field.min}.`);
    if (field.max !== undefined && value > field.max) return fail(`${field.label} must be at most ${field.max}.`);
    payload[field.name] = value;
  }

  try {
    const base = (process.env.SOLAR_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1/smartscheduling").replace(/\/$/, "");
    const response = await fetch(`${base}/${MODELS[model as Model].endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 404) return fail(`The ${model}-minute prediction endpoint is not available yet.`);
      if (response.status === 422 && body && typeof body === "object" && "detail" in body) {
        const detail = body.detail;
        if (typeof detail === "string") return fail(detail.slice(0, 500));
        if (Array.isArray(detail)) {
          const messages = detail.slice(0, 4).map((item: unknown) => {
            if (!item || typeof item !== "object") return "Invalid input";
            const entry = item as { loc?: unknown; msg?: unknown };
            const name = Array.isArray(entry.loc) ? entry.loc.filter((part) => part !== "body").join(" → ") : "Input";
            return `${name}: ${typeof entry.msg === "string" ? entry.msg : "Invalid value"}`;
          });
          return fail(messages.join(". "));
        }
      }
      return fail(`The prediction service returned an error (${response.status}). Please try again.`);
    }

    if (!body || typeof body !== "object" || !("predictions" in body) || !Array.isArray(body.predictions) || body.predictions.length !== 1) {
      return fail("The prediction service returned an unexpected response.");
    }
    const prediction = body.predictions[0] as Prediction | null;
    const resultFields = ["predicted_W_per_kWp", "pv_capacity_kwp", "predicted_W", "predicted_power_kw"] as const;
    if (!prediction || resultFields.some((name) => typeof prediction[name] !== "number" || !Number.isFinite(prediction[name]) || prediction[name] < 0) || prediction.pv_capacity_kwp <= 0) {
      return fail("The prediction service returned invalid prediction values.");
    }
    return { requestKey: key, prediction, timestamp: String(payload.timestamp), model };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return fail(timedOut
      ? "The prediction took longer than 30 seconds. Please try again."
      : "Cannot reach the prediction service. Check that FastAPI is running and reachable from the Next.js server.");
  }
}
