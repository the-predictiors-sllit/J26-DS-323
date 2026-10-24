"use server";

import { prepareSubmission } from "./utils/submission";
import {
  type Prediction,
  type PredictionState,
  type Submission,
} from "./types";

export async function predictSolar(
  _previous: PredictionState,
  formData: FormData,
): Promise<PredictionState> {
  const requestKey = String(formData.get("submission") ?? "");
  const fail = (error: string): PredictionState => ({ requestKey, error });
  let input: Submission;
  let prepared: ReturnType<typeof prepareSubmission>;
  try {
    if (requestKey.length > 900_000)
      return fail("The request is too large. Choose a smaller range.");
    input = JSON.parse(requestKey);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (name: string) =>
      parts.find((value) => value.type === name)?.value;
    prepared = prepareSubmission(
      input,
      `${part("year")}-${part("month")}-${part("day")}`,
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Invalid prediction inputs.",
    );
  }

  try {
    const backend = (
      process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
    ).replace(/\/$/, "");
    const base = (
      process.env.SOLAR_API_BASE_URL ?? `${backend}/api/v1/smartscheduling`
    ).replace(/\/$/, "");
    const response = await fetch(`${base}/${prepared.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prepared.payload),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (body && typeof body === "object" && "detail" in body) {
        if (typeof body.detail === "string")
          return fail(body.detail.slice(0, 1000));
        if (Array.isArray(body.detail))
          return fail(
            body.detail
              .slice(0, 3)
              .map(
                (item) =>
                  `${Array.isArray(item.loc) ? item.loc.join(" → ") : "Input"}: ${item.msg ?? "Invalid value"}`,
              )
              .join(". "),
          );
      }
      return fail(
        response.status === 404
          ? "This endpoint is not installed. Update the backend router."
          : `Prediction failed (${response.status}). Please try again.`,
      );
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("predictions" in body) ||
      !Array.isArray(body.predictions) ||
      body.predictions.length !== prepared.times.length
    )
      return fail("The backend returned an unexpected number of predictions.");
    const predictions = body.predictions as Prediction[];
    const names = [
      "predicted_W_per_kWp",
      "pv_capacity_kwp",
      "predicted_W",
      "predicted_power_kw",
    ] as const;
    if (
      predictions.some(
        (row, index) =>
          !row ||
          row.timestamp !== prepared.times[index] ||
          names.some(
            (name) =>
              typeof row[name] !== "number" ||
              !Number.isFinite(row[name]) ||
              row[name] < 0,
          ) ||
          row.pv_capacity_kwp <= 0,
      )
    )
      return fail(
        "The backend returned invalid predictions or mismatched timestamps.",
      );
    return {
      requestKey,
      predictions,
      model: input.model,
      source: input.source,
    };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name);
    return fail(
      timeout
        ? "The request exceeded 90 seconds. Try a smaller range."
        : "Cannot reach the backend. Check that FastAPI is running.",
    );
  }
}
