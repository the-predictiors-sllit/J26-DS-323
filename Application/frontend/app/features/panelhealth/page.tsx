"use client"

import { ChangeEvent, FormEvent, useState } from "react"
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CloudSun,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react"

export default function PanelHealthPage() {
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [panelAge, setPanelAge] = useState("")
  const [ratedOutput, setRatedOutput] = useState("")
  const [analysisRun, setAnalysisRun] = useState(false)

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setUploadedFile(file.name)
  }

  const handleAnalyze = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAnalysisRun(true)
  }

  const analyzedFile = uploadedFile ?? "IMG_0547.jpg"
  const analyzedAge = panelAge || "4"
  const analyzedCapacity = Number(ratedOutput) || 450
  const predictedLower = Math.round(analyzedCapacity * 0.751)
  const predictedUpper = Math.round(analyzedCapacity * 0.791)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            Live system overview
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Panel health monitoring</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Keep an eye on performance, temperature, and early degradation signals across your solar array.
          </p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium shadow-sm transition hover:border-primary hover:text-primary">
          <RefreshCw className="size-4" />
          Updated 2 min ago
        </button>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <div className="relative overflow-hidden rounded-xl border bg-foreground p-6 text-background shadow-sm">
          <div className="absolute -right-10 -top-16 size-52 rounded-full border border-background/10" />
          <div className="absolute -right-2 -top-8 size-36 rounded-full border border-background/10" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-background/60">Overall health score</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-6xl font-semibold tracking-tight">94</span>
                  <span className="mb-2 text-xl text-background/60">/100</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="size-4" />
                Healthy
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs text-background/55">
                <span>System condition</span>
                <span>Excellent</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background/15">
                <div className="h-full w-[94%] rounded-full bg-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Efficiency</p>
            <ArrowUpRight className="size-4 text-emerald-600" />
          </div>
          <p className="mt-5 text-3xl font-semibold">92.4%</p>
          <p className="mt-2 text-xs text-muted-foreground">+3.2% from last week</p>
          <div className="mt-5 flex h-10 items-end gap-1">
            {[45, 52, 48, 66, 61, 74, 70, 84, 78, 92].map((height, index) => (
              <span key={index} className="flex-1 rounded-t-sm bg-amber-400/70" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Open alerts</p>
            <CircleAlert className="size-4 text-amber-600" />
          </div>
          <p className="mt-5 text-3xl font-semibold">2</p>
          <p className="mt-2 text-xs text-muted-foreground">1 needs attention today</p>
          <div className="mt-5 flex items-center gap-2 text-xs font-medium text-amber-700">
            <span className="size-2 rounded-full bg-amber-500" />
            Soiling detected on 3 panels
          </div>
        </div>
      </section>

      <section>
        <form onSubmit={handleAnalyze} className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Inspect a panel</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add panel details and a photo for an AI-assisted review.</p>
            </div>
            <CloudSun className="size-5 text-amber-600" />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <label className="flex min-h-28 cursor-pointer items-center justify-center rounded-lg border border-dashed bg-muted/30 p-4 text-center transition hover:border-primary hover:bg-primary/5">
              <span>
                <Upload className="mx-auto size-5 text-muted-foreground" />
                <span className="mt-2 block max-w-xs truncate text-sm font-medium">{uploadedFile ?? "Upload a panel photo"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">JPG or PNG, up to 10 MB</span>
              </span>
              <input type="file" accept="image/*" required className="sr-only" onChange={handleUpload} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="grid gap-1.5 text-sm font-medium">
                Panel age
                <span className="flex items-center rounded-md border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={panelAge}
                    onChange={(event) => setPanelAge(event.target.value)}
                    placeholder="e.g. 5"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  />
                  <span className="pr-3 text-xs text-muted-foreground">years</span>
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Rated output
                <span className="flex items-center rounded-md border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={ratedOutput}
                    onChange={(event) => setRatedOutput(event.target.value)}
                    placeholder="e.g. 450"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  />
                  <span className="pr-3 text-xs text-muted-foreground">watts</span>
                </span>
              </label>
            </div>
          </div>
          <div className="mt-5 flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" />
              No critical degradation in the latest review
            </div>
            <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
              {analysisRun ? "Analysis ready" : "Analyze panel"}
              <ChevronRight className="size-4" />
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-2 border-b pb-5 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <h2 className="font-semibold">Panel analysis result</h2>
            </div>
            {analysisRun ? <span className="text-xs text-emerald-600">Updated just now</span> : null}
            <p className="mt-2 text-sm text-muted-foreground">
              Photo analyzed: <span className="font-medium text-foreground">{analyzedFile}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Site age: <span className="font-medium text-foreground">{analyzedAge} years</span>
              <span className="mx-2 text-border">|</span>
              Rated capacity: <span className="font-medium text-foreground">{analyzedCapacity}W</span>
            </p>
          </div>
          <span className="w-fit rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Early Degradation</span>
        </div>

        <div className="grid gap-5 py-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg bg-foreground p-5 text-background">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-background/60">Health score</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-5xl font-semibold">78</span>
              <span className="mb-1 text-lg text-background/60">/ 100</span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-background/15">
              <div className="h-full w-[78%] rounded-full bg-amber-400" />
            </div>
            <p className="mt-3 text-xs text-background/60">Structural score from visual condition and panel history.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Detected issue</p>
              <p className="mt-2 text-sm font-medium">Early-stage algae growth, lower-left region</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Model confidence region: Grad-CAM heatmap highlighting the affected area.</p>
            </div>
            <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed bg-muted/30 p-4 text-center">
              <div>
                <div className="mx-auto size-12 rounded-full border-4 border-amber-400/40 bg-amber-400/15 shadow-[inset_12px_10px_0_rgba(245,158,11,0.12)]" />
                <p className="mt-2 text-[11px] font-medium text-muted-foreground">Grad-CAM focus area</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Predicted output range</p>
            <p className="mt-2 text-2xl font-semibold">{predictedLower}W – {predictedUpper}W</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Approximately 75–79% of a healthy baseline panel of this rating, based on recent clear-day peak comparison.</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Surface observation</p>
            <p className="mt-2 text-sm font-medium">Algae film detected</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">This is a separate, reversible finding. Cleaning will not change the Health Score.</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">Recommendation</p>
            <p className="mt-1 text-sm leading-6 text-emerald-950/75 dark:text-emerald-100/75">Continue monitoring. No inspection needed at this stage; recheck in 2–3 months.</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">Review recommended</p>
            <p className="mt-1 text-xs text-amber-900/70 dark:text-amber-100/70">Three panels show possible surface soiling. A clean-and-recheck is recommended.</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-1 self-start text-sm font-semibold text-amber-800 hover:underline dark:text-amber-200 sm:self-auto">
          View alert
          <ChevronRight className="size-4" />
        </button>
      </section>
    </main>
  )
}