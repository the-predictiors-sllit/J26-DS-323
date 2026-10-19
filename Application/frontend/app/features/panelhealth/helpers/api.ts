/**
 * api.ts - calls to the Backend's panelhealth feature (FastAPI).
 * The Backend mounts it at /api/v1/panelhealth. The browser calls that path on THIS site and
 * next.config.ts forwards it to the Backend (BACKEND_URL, default http://127.0.0.1:8000),
 * so the Backend needs no CORS settings.
 */
const PREFIX = "/api/v1/panelhealth"

export type Tier = "Healthy" | "Early" | "Moderate" | "Severe"

/** The answer from POST /panelhealth/predict (see schemas.py in the Backend). */
export interface PanelReport {
  health_score: number
  degradation_category: Tier
  recommendation: string
  surface_deposit_detected: boolean
  surface_observation: string | null
  soiling_probability: number
  predicted_output_pct: number
  output_range_pct: number[]
  output_range_w: number[]
  rated_capacity_w: number
  note: string
  heatmap_png_base64?: string | null
  heatmap_error?: string | null
}

async function send(path: string, form: FormData): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${PREFIX}${path}`, { method: "POST", body: form })
  } catch {
    throw new Error("Could not reach the analysis service. Check that the Backend is running.")
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  return res
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) return "Some details were missing or invalid. Please check the form."
  } catch {
    /* the body was not JSON */
  }
  return `The analysis service returned an error (${res.status}).`
}

/** The straightened panel, as an image to show before the analysis runs. */
export async function previewCrop(photo: Blob, corners: number[]): Promise<Blob> {
  const form = new FormData()
  form.append("file", photo, "panel.jpg")
  form.append("corners", JSON.stringify(corners))
  return (await send("/crop", form)).blob()
}

export async function analyzePanel(args: {
  photo: Blob
  corners: number[]
  ratedCapacityW: number
  ageYears: number
}): Promise<PanelReport> {
  const form = new FormData()
  form.append("file", args.photo, "panel.jpg")
  form.append("corners", JSON.stringify(args.corners))
  form.append("rated_capacity_w", String(args.ratedCapacityW))
  form.append("age_years", String(args.ageYears))
  form.append("explain", "true")
  return (await send("/predict", form)).json() as Promise<PanelReport>
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(new Error("Could not read the panel image."))
    reader.readAsDataURL(blob)
  })
}

/**
 * The analysis as a PDF. The page sends the result it already holds (and the straightened panel image) and the Backend draws the
 * PDF in memory and returns it: nothing is stored on the server (see ReportRequest in schemas.py).
 */
export async function downloadReport(args: {
  report: PanelReport
  ageYears: number
  photoName: string
  crop: Blob | null
}): Promise<{ blob: Blob; filename: string }> {
  const payload = {
    report: args.report,
    age_years: args.ageYears,
    photo_name: args.photoName,
    crop_jpeg_base64: args.crop ? await blobToBase64(args.crop) : null,
  }
  let res: Response
  try {
    res = await fetch(`${PREFIX}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error("Could not reach the report service. Check that the Backend is running.")
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  const named = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")
  return { blob: await res.blob(), filename: named?.[1] ?? "panel-health-report.pdf" }
}
