"use client";

import styles from "./solar-studio.module.css";

import { useEffect, useRef, useState } from "react";
import { useSection, type Section } from "./_lib/navigation";
import {
  AlertCircle,
  Download,
  RefreshCw,
  ScanLine,
  Upload,
} from "lucide-react";
import { Button, buttonStyles } from "./_components/primitives";
import { OrientationPanel } from "./_components/orientation-panel";
import {
  getHealth,
  segmentPhoto,
  type Health,
  type SegmentationResult,
} from "./_lib/api";

type Preview = "original" | "overlay" | "mask";

const PREVIEWS: Preview[] = ["original", "mask", "overlay"];

const PREVIEW_INFO: Record<
  Preview,
  { title: string; description: string; alt: string }
> = {
  original: {
    title: "Original photo",
    description: "The original photograph of your site.",
    alt: "Original uploaded site photograph",
  },
  overlay: {
    title: "Obstacle overlay",
    description: "Red highlights predicted obstacles.",
    alt: "Site photograph with predicted obstacles highlighted in red",
  },
  mask: {
    title: "Binary mask",
    description: "Black: sky. White: obstacles.",
    alt: "Predicted binary mask with black sky and white obstacles",
  },
};

export default function SolarSetup() {
  const tab = useSection();

  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SegmentationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<Preview>("mask");
  const [dragging, setDragging] = useState(false);
  const [sunMotion, setSunMotion] = useState(true);

  const photoInput = useRef<HTMLInputElement>(null);

  const setTab = (value: Section) => {
    window.location.hash = value;
  };

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
    setDragging(false);

    if (!photo || busy) return;

    if (!["image/jpeg", "image/png"].includes(photo.type)) {
      setError("Choose a JPEG or PNG photo.");
      return;
    }

    if (photo.size > 20 * 1024 * 1024) {
      setError("Choose a photo up to 20 MB.");
      return;
    }

    setError("");
    setResult(null);
    setView("mask");
    setFile(photo);
  }

  async function run() {
    if (!file || busy) return;

    setBusy(true);
    setDragging(false);
    setError("");
    setResult(null);

    try {
      const prediction = await segmentPhoto(file);
      setView("mask");
      setResult(prediction);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect to the backend.",
      );
    } finally {
      setBusy(false);
    }
  }

  function previewSource(option: Preview) {
    return option === "original" ? url : result?.[option] ?? "";
  }

  return (
    <div className={`${styles.studio} solar-studio w-full text-foreground`}>
      <main className="mx-auto max-w-7xl">
        <header className="studio-header">
          <div>
            <p className="eyebrow">SOLAR SETUP</p>

            <h1 className="page-title">
              {tab === "analysis" ? (
                result ? (
                  <>
                    Review <span>your site.</span>
                  </>
                ) : (
                  <>
                    Plan with a <span>clearer view.</span>
                  </>
                )
              ) : (
                "Find your solar orientation"
              )}
            </h1>

            <p className="page-description">
              {tab === "analysis"
                ? result
                  ? "Compare your photograph with the predicted sky and obstacles."
                  : "A clearer view of the sky is the first step towards planning your solar setup."
                : "Choose your site, check the sun path and explore the best panel direction."}
            </p>
          </div>

          <div className="health-control">
            <span className="health-label" role="status">
              <span
                aria-hidden="true"
                className={`health-dot ${
                  health?.model_loaded ? "ready" : ""
                }`}
              />
              {checking
                ? "Checking…"
                : health?.model_loaded
                  ? "Model ready"
                  : health
                    ? "Model missing"
                    : "Backend offline"}
            </span>

            <Button
              variant="ghost"
              disabled={checking}
              onClick={() => void check()}
              aria-label="Refresh backend status"
            >
              <RefreshCw
                size={15}
                className={checking ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>
        </header>

        {/* Preserve orientation form state when switching sections. */}
        <div hidden={tab !== "orientation"}>
          <OrientationPanel
            predictedMask={result?.mask}
            photoUrl={result ? url : undefined}
          />
        </div>

        {tab === "analysis" ? (
          <section aria-label="Site analysis">
            <input
              ref={photoInput}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png"
              disabled={busy}
              aria-label="Site photograph"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <p role="status" className="sr-only">
              {busy
                ? "Analyzing the photo. Please wait."
                : result
                  ? "Analysis complete. Original, overlay and mask are available."
                  : ""}
            </p>

            {error && (
              <div role="alert" className="error-message">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div aria-busy={busy}>
              {busy ? (
                <div key="processing" className="stage processing">
                  <div className="scan-frame">
                    {url && (
                      <img
                        src={url}
                        alt="Site photograph being analyzed"
                        className="scan-photo"
                      />
                    )}
                    <div className="scan-shade" />
                    <div className="scan-line" />
                    <span className="scan-corner top-left" />
                    <span className="scan-corner top-right" />
                    <span className="scan-corner bottom-left" />
                    <span className="scan-corner bottom-right" />
                  </div>

                  <div className="processing-copy">
                    <p className="eyebrow">ANALYSIS IN PROGRESS</p>
                    <h2>Finding the sky between the obstacles</h2>
                    <p>
                      Your original photo, obstacle overlay and binary mask
                      will appear together when processing is complete.
                    </p>
                    <div className="processing-status">
                      <RefreshCw
                        size={16}
                        className="motion-safe:animate-spin"
                      />
                      Generating your mask…
                    </div>
                  </div>
                </div>
              ) : !result ? (
                <div key="upload" className="stage upload-layout">
                  <div className="upload-column">
                    <div className="upload-card">
                      <div className="upload-card-heading">
                        <span className="small-icon">
                          <Upload size={19} />
                        </span>
                        <div>
                          <h2>Your site starts here</h2>
                          <p>Upload an upward-facing fisheye photo.</p>
                        </div>
                      </div>

                      <div
                        className={`drop-area ${
                          dragging ? "is-dragging" : ""
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={(e) => {
                          const next = e.relatedTarget;

                          if (
                            !(next instanceof Node) ||
                            !e.currentTarget.contains(next)
                          ) {
                            setDragging(false);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          choose(e.dataTransfer.files[0]);
                        }}
                      >
                        {url ? (
                          <>
                            <img
                              src={url}
                              alt="Selected site photograph"
                              className="upload-preview"
                            />
                            <p className="file-name">{file?.name}</p>
                            <Button
                              variant="secondary"
                              onClick={() => photoInput.current?.click()}
                            >
                              Change photo
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="upload-symbol">
                              <Upload size={30} strokeWidth={1.5} />
                            </div>
                            <p className="drop-title">
                              Drop your photo here
                            </p>
                            <p className="file-hint">
                              JPEG or PNG · Up to 20 MB
                            </p>
                            <Button
                              className="mt-5 w-full"
                              onClick={() => photoInput.current?.click()}
                            >
                              Choose photo
                              <span aria-hidden="true">↗</span>
                            </Button>
                          </>
                        )}
                      </div>

                      {file && (
                        <div className="generate-action">
                          <Button
                            className="w-full"
                            disabled={!health?.model_loaded || busy}
                            onClick={() => void run()}
                          >
                            <ScanLine size={17} />
                            Generate mask
                            <span aria-hidden="true">→</span>
                          </Button>
                        </div>
                      )}

                      {!checking && !health?.model_loaded && (
                        <p className="availability-note">
                          {health
                            ? "The model is unavailable. Check the backend, then refresh its status."
                            : "Start the backend, then refresh its status above."}
                        </p>
                      )}
                    </div>

                    <details className="photo-guidelines">
                      <summary>Photo guidelines</summary>
                      <ul>
                        <li>Keep the camera level and facing upwards.</li>
                        <li>
                          Preserve the original orientation and record where
                          True North appears.
                        </li>
                        <li>Avoid hands and people covering the sky.</li>
                        <li>
                          Keep the lens and projection details for the
                          orientation calculation.
                        </li>
                      </ul>
                    </details>
                  </div>

                  <div className="scene-column">
                    <div className="solar-scene">
                      <div className="scene-halo" />

                      <img
                        src="/solarsetup/solar-house.png"
                        alt=""
                        className="house-image"
                        draggable={false}
                      />

                      <svg
                        className="sun-path"
                        viewBox="0 0 600 600"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M60 220 Q300 -40 540 220"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeDasharray="5 8"
                          opacity="0.65"
                        />

                        <circle
                          cx="60"
                          cy="220"
                          r="3"
                          fill="currentColor"
                          opacity="0.6"
                        />
                        <circle
                          cx="540"
                          cy="220"
                          r="3"
                          fill="currentColor"
                          opacity="0.6"
                        />

                        {sunMotion ? (
                          <g className="moving-sun">
                            <circle
                              r="27"
                              fill="currentColor"
                              opacity="0.08"
                            />
                            <circle
                              r="18"
                              fill="currentColor"
                              opacity="0.16"
                            />
                            <circle
                              r="10"
                              fill="currentColor"
                              stroke="#fff2c6"
                              strokeWidth="2"
                            />
                            <animateMotion
                              dur="12s"
                              repeatCount="indefinite"
                              path="M60 220 Q300 -40 540 220"
                              calcMode="spline"
                              keyTimes="0;1"
                              keyPoints="0;1"
                              keySplines="0.4 0 0.6 1"
                            />
                          </g>
                        ) : null}

                        <g
                          className={
                            sunMotion ? "static-sun" : "paused-sun"
                          }
                          transform="translate(300 90)"
                        >
                          <circle
                            r="27"
                            fill="currentColor"
                            opacity="0.08"
                          />
                          <circle
                            r="18"
                            fill="currentColor"
                            opacity="0.16"
                          />
                          <circle
                            r="10"
                            fill="currentColor"
                            stroke="#fff2c6"
                            strokeWidth="2"
                          />
                        </g>
                      </svg>
                    </div>

                    <div className="scene-caption">
                      <span>Illustrative sun motion</span>
                      <button
                        type="button"
                        className="motion-toggle"
                        onClick={() => setSunMotion((value) => !value)}
                        aria-label={
                          sunMotion
                            ? "Pause decorative sun animation"
                            : "Play decorative sun animation"
                        }
                      >
                        {sunMotion ? "Pause motion" : "Play motion"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key="result" className="stage result-layout">
                  <div className="result-heading">
                    <span className="complete-badge">
                      <span aria-hidden="true">✓</span>
                      Analysis complete
                    </span>
                    <p>Select a preview to enlarge the image.</p>
                  </div>

                  <div
                    className={`result-gallery selected-${view}`}
                    role="group"
                    aria-label="Segmentation previews"
                  >
                    {PREVIEWS.map((option, index) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={view === option}
                        aria-label={`Enlarge ${PREVIEW_INFO[option].title}`}
                        onClick={() => setView(option)}
                        className={`preview-card preview-${index} ${
                          view === option ? "is-selected" : ""
                        }`}
                      >
                        <span className="preview-heading">
                          <span>{PREVIEW_INFO[option].title}</span>
                          <span
                            className="preview-indicator"
                            aria-hidden="true"
                          >
                            {view === option ? "●" : "↗"}
                          </span>
                        </span>

                        <span className="preview-image-area">
                          <img
                            src={previewSource(option)}
                            alt={PREVIEW_INFO[option].alt}
                            className="result-image"
                          />
                        </span>

                        <span className="preview-caption">
                          {PREVIEW_INFO[option].description}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="gallery-toolbar">
                    <div className="gallery-tools">
                      <Button
                        variant="secondary"
                        onClick={() => photoInput.current?.click()}
                      >
                        <Upload size={16} />
                        Change photo
                      </Button>

                      <a
                        className={buttonStyles("secondary")}
                        href={result.mask}
                        download={result.filename}
                      >
                        <Download size={16} />
                        Download mask
                      </a>
                    </div>

                    <span className="export-size">
                      {result.width} × {result.height} px
                    </span>
                  </div>

                  <div className="continue-row">
                    <p>
                      <AlertCircle size={16} className="shrink-0" />
                      <span>
                        Review branches, wires and bright walls. Clouds
                        belong to sky. North alignment and lens projection
                        are not verified by this prediction.
                      </span>
                    </p>

                    <Button
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => setTab("orientation")}
                    >
                      Continue with this mask
                      <span aria-hidden="true">→</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <footer className="studio-footer">
          Solar Setup · Shading-aware orientation planning
        </footer>
      </main>
    </div>
  );
}