"use client"

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react"
import { ChevronRight, CircleAlert, CloudSun, Crop, RefreshCw, Upload } from "lucide-react"
import AnalysisResult from "./components/AnalysisResult"
import PanelCornerPicker from "./components/PanelCornerPicker"
import PanelHero from "./components/PanelHero"
import { analyzePanel, previewCrop } from "./helpers/api"
import type { PanelReport } from "./helpers/api"
import { prepareUpload } from "./helpers/prepareUpload"
import type { PreparedImage } from "./helpers/prepareUpload"

/** Installation month ("2022-06") to the panel's age in years, or null if it is not a sensible date. */
function ageFromMonth(month: string): number | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const start = new Date(`${month}-01T00:00:00`)
  const years = (Date.now() - start.getTime()) / (365.25 * 24 * 3600 * 1000)
  return years >= 0 && years <= 40 ? Math.round(years * 100) / 100 : null
}

export default function PanelHealthPage() {
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [photoName, setPhotoName] = useState("")
  const [corners, setCorners] = useState<number[] | null>(null)
  const [cropUrl, setCropUrl] = useState<string | null>(null)
  const [ratedOutput, setRatedOutput] = useState("")
  const [installMonth, setInstallMonth] = useState("")
  const [report, setReport] = useState<PanelReport | null>(null)
  const [reportAge, setReportAge] = useState(0)
  const [busy, setBusy] = useState<"crop" | "analyze" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (report) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [report])

  const clearPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url)
    if (cropUrl) URL.revokeObjectURL(cropUrl)
    setPhoto(null)
    setCorners(null)
    setCropUrl(null)
    setReport(null)
    setError(null)
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = "" // so choosing the same file again still fires
    if (!file) return
    clearPhoto()
    try {
      setPhoto(await prepareUpload(file))
      setPhotoName(file.name)
    } catch {
      setError("That photo could not be opened. Please use a JPG or PNG.")
    }
  }

  const handlePreview = async (picked: number[]) => {
    if (!photo) return
    setBusy("crop")
    setError(null)
    try {
      const blob = await previewCrop(photo.blob, picked)
      if (cropUrl) URL.revokeObjectURL(cropUrl)
      setCorners(picked)
      setCropUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview the crop.")
    } finally {
      setBusy(null)
    }
  }

  const adjustCorners = () => {
    if (cropUrl) URL.revokeObjectURL(cropUrl)
    setCropUrl(null)
    setReport(null)
  }

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!photo || !corners) return
    const ageYears = ageFromMonth(installMonth)
    const watts = Number(ratedOutput)
    if (ageYears === null) {
      setError("Enter the month the panel was installed (not in the future, and within the last 40 years).")
      return
    }
    if (!(watts > 0 && watts <= 1000)) {
      setError("Enter the rated output printed on the panel, between 1 and 1000 watts.")
      return
    }
    setBusy("analyze")
    setError(null)
    try {
      setReport(await analyzePanel({ photo: photo.blob, corners, ratedCapacityW: watts, ageYears }))
      setReportAge(ageYears)
    } catch (err) {
      setError(err instanceof Error ? err.message : "The analysis failed. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  const step = !photo ? 1 : !cropUrl ? 2 : 3
  const stepText = [
    "Step 1 of 3: choose a photo of one panel, taken straight on in daylight.",
    "Step 2 of 3: tap the four corners of the panel, then preview the crop.",
    "Step 3 of 3: check the crop, add the panel details and analyze.",
  ][step - 1]

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-8">
      <PanelHero />

      <section>
        <form onSubmit={handleAnalyze} className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Inspect a panel</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add a photo and the panel details for an AI-assisted review.</p>
            </div>
            <CloudSun className="size-5 text-amber-600" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              {!photo ? (
                <label className="flex min-h-48 cursor-pointer items-center justify-center rounded-lg border border-dashed bg-muted/30 p-4 text-center transition hover:border-primary hover:bg-primary/5">
                  <span>
                    <Upload className="mx-auto size-5 text-muted-foreground" />
                    <span className="mt-2 block text-sm font-medium">Upload a panel photo</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      JPG or PNG. Stand straight in front of the panel and keep your shadow off it.
                    </span>
                  </span>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleUpload} />
                </label>
              ) : !cropUrl ? (
                <PanelCornerPicker
                  imageUrl={photo.url}
                  imageWidth={photo.width}
                  imageHeight={photo.height}
                  busy={busy === "crop"}
                  onConfirm={handlePreview}
                />
              ) : (
                <div className="grid gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cropUrl} alt="The straightened panel" className="mx-auto max-h-96 rounded-lg border" />
                  <p className="text-center text-sm text-muted-foreground">
                    Does this show only your panel, upright? If not, adjust the corners.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={adjustCorners}
                      disabled={busy !== null}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Crop className="size-4" />
                      Adjust corners
                    </button>
                    <button
                      type="button"
                      onClick={clearPhoto}
                      disabled={busy !== null}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Upload className="size-4" />
                      Choose another photo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="grid gap-1.5 text-sm font-medium">
                Rated output
                <span className="flex items-center rounded-md border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="1000"
                    step="1"
                    required
                    value={ratedOutput}
                    onChange={(event) => setRatedOutput(event.target.value)}
                    placeholder="e.g. 450"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  />
                  <span className="pr-3 text-xs text-muted-foreground">watts</span>
                </span>
                <span className="text-xs font-normal text-muted-foreground">Printed on the label on the back of the panel.</span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Installation date
                <span className="flex items-center rounded-md border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    type="month"
                    required
                    value={installMonth}
                    onChange={(event) => setInstallMonth(event.target.value)}
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  />
                </span>
                <span className="text-xs font-normal text-muted-foreground">Month and year the panel was installed.</span>
              </label>
            </div>
          </div>

          {error ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-red-600">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`size-2 shrink-0 rounded-full ${step === 3 ? "bg-emerald-500" : "bg-amber-500"}`} />
              {stepText}
            </div>
            <button
              type="submit"
              disabled={!cropUrl || busy !== null}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy === "analyze" ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Analyze panel
                  <ChevronRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      <div ref={resultRef} className="scroll-mt-6">
        {report ? <AnalysisResult report={report} photoName={photoName} ageYears={reportAge} cropUrl={cropUrl} onReset={clearPhoto} /> : null}
      </div>
    </main>
  )
}
