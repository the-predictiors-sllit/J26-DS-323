import { CheckCircle2, CircleAlert, RotateCcw, ShieldCheck } from "lucide-react"
import type { PanelReport, Tier } from "../lib/api"

type Props = {
  report: PanelReport
  photoName: string
  ageYears: number
  onReset: () => void
}

const TIER_LABEL: Record<Tier, string> = {
  Healthy: "Healthy",
  Early: "Early degradation",
  Moderate: "Moderate degradation",
  Severe: "Severe degradation",
}

// Same visual language as the rest of the page: soft tinted pill, bar, and recommendation box per tier.
const TIER_STYLE: Record<Tier, { pill: string; bar: string; box: string; icon: string; text: string }> = {
  Healthy: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-400",
    box: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20",
    icon: "text-emerald-600",
    text: "text-emerald-950/75 dark:text-emerald-100/75",
  },
  Early: {
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-400",
    box: "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20",
    icon: "text-amber-600",
    text: "text-amber-950/75 dark:text-amber-100/75",
  },
  Moderate: {
    pill: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    bar: "bg-orange-400",
    box: "border-orange-200 bg-orange-50/70 dark:border-orange-900/50 dark:bg-orange-950/20",
    icon: "text-orange-600",
    text: "text-orange-950/75 dark:text-orange-100/75",
  },
  Severe: {
    pill: "bg-red-500/10 text-red-700 dark:text-red-300",
    bar: "bg-red-400",
    box: "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20",
    icon: "text-red-600",
    text: "text-red-950/75 dark:text-red-100/75",
  },
}

export default function AnalysisResult({ report, photoName, ageYears, onReset }: Props) {
  const tier = report.degradation_category
  const style = TIER_STYLE[tier]
  const score = Math.max(0, Math.min(100, report.health_score))
  const [lowW, highW] = report.output_range_w
  const [lowPct, highPct] = report.output_range_pct
  const hasHeatmap = Boolean(report.heatmap_png_base64)

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-2 border-b pb-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <h2 className="font-semibold">Panel analysis result</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Photo analyzed: <span className="font-medium text-foreground">{photoName}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Panel age: <span className="font-medium text-foreground">{ageYears.toFixed(1)} years</span>
            <span className="mx-2 text-border">|</span>
            Rated capacity: <span className="font-medium text-foreground">{report.rated_capacity_w}W</span>
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${style.pill}`}>{TIER_LABEL[tier]}</span>
      </div>

      <div className="grid gap-5 py-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg bg-foreground p-5 text-background">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-background/60">Health score</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-semibold">{Math.round(score)}</span>
            <span className="mb-1 text-lg text-background/60">/ 100</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-background/15">
            <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${score}%` }} />
          </div>
          <p className="mt-3 text-xs text-background/60">Estimated from the photo. A higher score means a healthier panel.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Surface observation</p>
            <p className="mt-2 text-sm font-medium">
              {report.surface_deposit_detected ? "Surface deposit detected" : "No surface deposit detected"}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {report.surface_deposit_detected
                ? (report.surface_observation ??
                  "A removable deposit (dust, droppings or stains) was found on the glass. It may be causing part of the lost output.")
                : "No removable dirt was found on the glass."}
            </p>
          </div>
          <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-3 text-center">
            {hasHeatmap ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${report.heatmap_png_base64}`}
                  alt="Heat map of the areas that lowered the score"
                  className="max-h-56 rounded-md"
                />
                <p className="mt-2 text-[11px] font-medium text-muted-foreground">Grad-CAM: red areas lowered the score most</p>
              </>
            ) : (
              <p className="text-[11px] font-medium text-muted-foreground">Heat map not available for this photo</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Predicted output range</p>
          <p className="mt-2 text-2xl font-semibold">
            {lowW}W – {highW}W
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            About {Math.round(lowPct)}–{Math.round(highPct)}% of the rated {report.rated_capacity_w}W. Real output also depends on sunlight,
            heat and shade.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">How to read this</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The score reflects overall condition seen in the photo, including dirt. The range is the output expected at good sunlight for a
            panel that looks like this. {report.note}
          </p>
        </div>
      </div>

      <div className={`mt-4 flex items-start gap-3 rounded-lg border p-4 ${style.box}`}>
        {tier === "Healthy" ? (
          <ShieldCheck className={`mt-0.5 size-5 shrink-0 ${style.icon}`} />
        ) : (
          <CircleAlert className={`mt-0.5 size-5 shrink-0 ${style.icon}`} />
        )}
        <div>
          <p className="text-sm font-semibold">Recommendation</p>
          <p className={`mt-1 text-sm leading-6 ${style.text}`}>{report.recommendation}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end border-t pt-4">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium shadow-sm transition hover:border-primary hover:text-primary"
        >
          <RotateCcw className="size-4" />
          Check another panel
        </button>
      </div>
    </section>
  )
}
