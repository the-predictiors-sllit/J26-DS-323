"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Download,
  RefreshCw,
  ScanLine,
  Sun,
  Upload,
} from "lucide-react";
import { Button, buttonStyles } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  getHealth,
  segmentPhoto,
  parseTestReport,
  type Health,
  type SegmentationResult,
  type TestReport,
} from "../lib/api";

export default function Home() {
  const [tab, setTab] = useState<"analysis" | "evaluation">("analysis");
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SegmentationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"overlay" | "mask" | "original">("overlay");
  const [report, setReport] = useState<TestReport | null>(null);
  const [reportError, setReportError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const reportInput = useRef<HTMLInputElement>(null);

  async function check() {
    setChecking(true);
    try {
      setHealth(await getHealth());
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function choose(photo?: File) {
    if (!photo || busy) return;
    setError("");
    setResult(null);
    setFile(null);
    if (!["image/jpeg", "image/png"].includes(photo.type)) {
      setError("Choose a JPEG or PNG photo.");
      return;
    }
    if (photo.size > 20 * 1024 * 1024) {
      setError("Choose a photo up to 20 MB.");
      return;
    }
    setFile(photo);
  }
  async function run() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await segmentPhoto(file));
      setView("overlay");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect to the backend.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function readReport(reportFile?: File) {
    if (!reportFile) return;
    setReportError("");
    try {
      setReport(parseTestReport(await reportFile.text()));
    } catch {
      setReport(null);
      setReportError(
        "Choose a valid test_metrics.json exported after evaluation.",
      );
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold">
            <Sun className="text-blue-600" aria-hidden="true" />
            SolarView
          </a>
          <nav aria-label="Workspace" className="flex flex-wrap gap-2">
            <Button
              variant={tab === "analysis" ? "primary" : "ghost"}
              aria-pressed={tab === "analysis"}
              onClick={() => setTab("analysis")}
            >
              <ScanLine size={18} />
              Site analysis
            </Button>
            <Button
              variant={tab === "evaluation" ? "primary" : "ghost"}
              aria-pressed={tab === "evaluation"}
              onClick={() => setTab("evaluation")}
            >
              <Activity size={18} />
              Model evaluation
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-500">
              Pre-installation solar research
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {tab === "analysis"
                ? "Sky and obstacle segmentation"
                : "Model evaluation"}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              {tab === "analysis"
                ? "Upload a site photograph, generate a binary mask and review the prediction."
                : "Inspect measured results from the held-out reference test set."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600" role="status">
              {checking
                ? "Checking backend…"
                : health?.model_loaded
                  ? "Model ready"
                  : health
                    ? "Model missing"
                    : "Backend offline"}
            </span>
            <Button
              variant="secondary"
              disabled={checking}
              onClick={() => void check()}
              aria-label="Refresh backend status"
            >
              <RefreshCw
                size={16}
                className={checking ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>
        </div>
        {tab === "analysis" ? (
          <>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                "Upload original photo",
                "Generate mask",
                "Review and export",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{step}</span>
                </li>
              ))}
            </ol>
            <div className="grid items-start gap-6 lg:grid-cols-5">
              <Card className="space-y-4 lg:col-span-2">
                <h2 className="text-lg font-semibold">Site photograph</h2>
                <input
                  ref={photoInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={busy}
                  aria-label="Site photograph"
                  onChange={(e) => {
                    choose(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    choose(e.dataTransfer.files[0]);
                  }}
                  className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4"
                >
                  {url ? (
                    <img
                      src={url}
                      alt="Original site photograph"
                      className="max-h-72 w-full object-contain"
                    />
                  ) : (
                    <>
                      <Upload className="text-slate-400" size={32} />
                      <p className="text-center text-sm text-slate-600">
                        Drop a fisheye photo here
                        <br />
                        JPEG or PNG, up to 20 MB
                      </p>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => photoInput.current?.click()}
                  >
                    {file ? "Change photo" : "Choose photo"}
                  </Button>
                </div>
                {file && (
                  <p className="break-all text-xs text-slate-500">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
                <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                  <h3 className="mb-2 font-medium text-slate-900">
                    Capture checklist
                  </h3>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Keep the camera level and facing upwards.</li>
                    <li>Keep the original image orientation.</li>
                    <li>Avoid hands and people covering the sky.</li>
                  </ul>
                </div>
                <Button
                  className="w-full"
                  onClick={() => void run()}
                  disabled={!file || !health?.model_loaded || busy}
                >
                  {busy ? (
                    <RefreshCw size={18} className="motion-safe:animate-spin" />
                  ) : (
                    <ScanLine size={18} />
                  )}
                  {busy ? "Generating mask…" : "Generate mask"}
                </Button>
                {!checking && !health?.model_loaded && (
                  <p className="text-sm text-slate-600">
                    {health
                      ? health.message ||
                        "Add best_model.pt to models/ and restart the backend."
                      : "Start the Python backend to connect your model."}
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}
              </Card>
              <Card className="space-y-4 lg:col-span-3" aria-busy={busy}>
                <h2 className="text-lg font-semibold">Segmentation result</h2>
                <div className="flex flex-wrap gap-2" aria-label="Preview view">
                  {(["overlay", "mask", "original"] as const).map((option) => (
                    <Button
                      key={option}
                      variant={view === option ? "primary" : "secondary"}
                      disabled={!result}
                      aria-pressed={view === option}
                      onClick={() => setView(option)}
                    >
                      {option === "overlay"
                        ? "Obstacle overlay"
                        : option === "mask"
                          ? "Binary mask"
                          : "Original"}
                    </Button>
                  ))}
                </div>
                <div className="flex min-h-80 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {result ? (
                    <img
                      src={view === "original" ? url : result[view]}
                      alt={
                        view === "mask"
                          ? "Predicted mask: black sky, white obstacles"
                          : view === "original"
                            ? "Original photograph"
                            : "Red overlay on predicted obstacles"
                      }
                      className="max-h-96 w-full object-contain"
                    />
                  ) : (
                    <div className="py-12 text-center text-slate-500">
                      <Sun className="mx-auto mb-4" size={40} />
                      <p>
                        {busy
                          ? "Analyzing your photo…"
                          : "Your prediction will appear here."}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-slate-600">
                    Black: sky · White: obstacle · Red: overlay
                  </p>
                  {result && (
                    <a
                      className={buttonStyles("primary")}
                      href={result.mask}
                      download={result.filename}
                    >
                      <Download size={16} />
                      Download mask
                    </a>
                  )}
                </div>
                {result && (
                  <p className="text-xs text-slate-500">
                    {result.width} × {result.height} px export ·{" "}
                    {result.input_size} px model input · Epoch{" "}
                    {result.checkpoint_epoch}
                  </p>
                )}
              </Card>
            </div>
            <p className="flex gap-2 text-sm text-slate-600">
              <AlertCircle size={18} className="shrink-0" />
              Predictions need human review, especially branches, wires and
              bright walls. Clouds belong to sky. This mask does not verify
              North alignment or lens projection.
            </p>
            <Card>
              <h2 className="font-semibold">Solar orientation — planned</h2>
              <p className="mt-2 text-sm text-slate-600">
                Camera calibration, GPS, annual sun paths, optimal tilt and
                azimuth, and energy comparison are not implemented in this
                version.
              </p>
            </Card>
          </>
        ) : (
          <>
            <Card className="space-y-5">
              <h2 className="text-lg font-semibold">Held-out test report</h2>
              <p className="text-sm text-slate-600">
                Load the actual <code>test_metrics.json</code> produced after
                evaluation. No example scores are displayed.
              </p>
              <input
                ref={reportInput}
                className="hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Test metrics JSON"
                onChange={(e) => {
                  void readReport(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => reportInput.current?.click()}>
                <Upload size={18} />
                Choose test report
              </Button>
              {reportError && (
                <p role="alert" className="text-sm text-red-700">
                  {reportError}
                </p>
              )}
              {report ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Mean IoU", report.test_metrics.miou],
                      ["Sky IoU", report.test_metrics.sky_iou],
                      ["Obstacle IoU", report.test_metrics.obstacle_iou],
                      ["Pixel accuracy", report.test_metrics.pixel_accuracy],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-lg bg-slate-50 p-5"
                      >
                        <p className="text-sm text-slate-500">{label}</p>
                        <p className="mt-2 text-3xl font-semibold">
                          {(Number(value) * 100).toFixed(2)}%
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-600">
                    Evaluated at {report.evaluation_resolution} px inside the
                    reference dataset’s circular valid region. These scores do
                    not measure local-site, optimal-angle or
                    electricity-generation accuracy.
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-slate-50 p-10 text-center text-slate-500">
                  No test report loaded.
                </p>
              )}
            </Card>
            <Card>
              <h2 className="font-semibold">Reference experiment split</h2>
              <p className="mt-2 text-sm text-slate-600">
                80 training pairs · 21 validation pairs · 21 test pairs. These
                are the recorded experiment counts; an uploaded metrics file
                does not verify a dataset split.
              </p>
            </Card>
          </>
        )}
        <footer className="border-t border-slate-200 pt-5 text-sm text-slate-500">
          SolarView · Kithmini’s pre-installation component
        </footer>
      </main>
    </div>
  );
}
