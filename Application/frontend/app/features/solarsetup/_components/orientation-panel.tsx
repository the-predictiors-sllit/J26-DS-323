"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Download,
  MapPin,
  RefreshCw,
  Settings2,
  Sun,
} from "lucide-react";
import { Button } from "./primitives";
import {
  calculateSolar,
  weatherTemplateUrl,
  type SolarReport,
  type SolarSettings,
  type SunMap,
} from "../_lib/solar-api";

const LocationPicker = dynamic(() => import("./location-picker"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[390px] place-items-center rounded-2xl bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

const defaults: SolarSettings = {
  latitude: 0,
  longitude: 0,
  timezone: "Asia/Colombo",
  altitude_m: 0,
  year: 2025,
  interval_minutes: 60,
  weather_mode: "historical",
  projection: "equisolid",
  center_x: 0.5,
  center_y: 0.5,
  radius: 0.5,
  north_offset_deg: 0,
  azimuth_clockwise: true,
  geometry_status: "assumed",
  geometry_acknowledged: false,
  baseline_tilt: 7,
  baseline_azimuth: 180,
  max_tilt: 60,
  albedo: 0.2,
  panel_count: null,
  panel_watts: null,
  performance_ratio: 0.8,
  seed: 42,
};

const fieldClass =
  "mt-2 block w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50";

const secondaryClass =
  "rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50";

const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Step = "location" | "settings" | "preview" | "results";
type ResultTab = "overview" | "sun" | "details";
type NumericKey = {
  [K in keyof SolarSettings]:
    SolarSettings[K] extends number | null ? K : never;
}[keyof SolarSettings];

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function Metric({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/75 p-5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {note && (
        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

function facing(azimuth: number) {
  const directions = [
    "North", "North-east", "East", "South-east",
    "South", "South-west", "West", "North-west",
  ];

  const normalized = ((azimuth % 360) + 360) % 360;
  return directions[Math.round(normalized / 45) % 8];
}

function SunOverlay({
  map,
  maskUrl,
  photoUrl,
}: {
  map: SunMap;
  maskUrl: string;
  photoUrl?: string;
}) {
  const [onPhoto, setOnPhoto] = useState(false);
  const scale = Math.min(map.mask_width, map.mask_height);

  return (
    <div className="space-y-4">
      {photoUrl && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onPhoto}
            onChange={(event) => setOnPhoto(event.target.checked)}
            className="accent-primary"
          />
          Show on original photo
        </label>
      )}

      <div className="rounded-2xl border border-border bg-muted/40 p-3">
        <svg
          viewBox={`0 0 ${map.mask_width} ${map.mask_height}`}
          className="mx-auto block max-h-[440px] w-full"
          role="img"
          aria-label="Annual sun samples, horizon and compass directions"
        >
          <image
            href={onPhoto && photoUrl ? photoUrl : maskUrl}
            width={map.mask_width}
            height={map.mask_height}
          />

          <circle
            cx={map.geometry.cx}
            cy={map.geometry.cy}
            r={map.geometry.radius}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={scale * 0.003}
          />

          {map.sun_samples.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={scale * 0.0018}
              fill={point.visible ? "#16a34a" : "#ef4444"}
              opacity={0.8}
            >
              <title>
                {point.time}: {point.visible ? "Visible" : "Blocked"}
              </title>
            </circle>
          ))}

          {map.geometry.cardinals.map((point) => (
            <text
              key={point.label}
              x={
                map.geometry.cx +
                (point.x - map.geometry.cx) * 0.91
              }
              y={
                map.geometry.cy +
                (point.y - map.geometry.cy) * 0.91
              }
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={scale * 0.03}
              fontWeight="bold"
              fill="#06b6d4"
              stroke="#0f172a"
              strokeWidth={scale * 0.0015}
              paintOrder="stroke"
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>🟢 Visible</span>
        <span>🔴 Blocked</span>
        <span>Horizon and compass directions shown in cyan</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Preview samples are thinned for display. Calculations use all
        configured time intervals.
      </p>
    </div>
  );
}

// A different predicted mask starts a fresh workspace.
// This also prevents results for one photo appearing beside another.
export function OrientationPanel({
  predictedMask,
  photoUrl,
}: {
  predictedMask?: string;
  photoUrl?: string;
}) {
  return (
    <OrientationWorkspace
      key={predictedMask || "manual-mask"}
      predictedMask={predictedMask}
      photoUrl={photoUrl}
    />
  );
}

function OrientationWorkspace({
  predictedMask,
  photoUrl,
}: {
  predictedMask?: string;
  photoUrl?: string;
}) {
  const reduceMotion = useReducedMotion();
  const top = useRef<HTMLDivElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const alive = useRef(true);

  const [step, setStep] = useState<Step>("location");
  const [settings, setSettings] = useState<SolarSettings>(defaults);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [manualMask, setManualMask] = useState<File | null>(null);
  const [maskUrl, setMaskUrl] = useState(predictedMask || "");
  const [weather, setWeather] = useState<File>();
  const [includeEnergy, setIncludeEnergy] = useState(false);
  const [map, setMap] = useState<SunMap | null>(null);
  const [report, setReport] = useState<SolarReport | null>(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "optimize" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [resultTab, setResultTab] = useState<ResultTab>("overview");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!manualMask) {
      setMaskUrl(predictedMask || "");
      return;
    }

    const objectUrl = URL.createObjectURL(manualMask);
    setMaskUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [manualMask, predictedMask]);

  function go(next: Step) {
    setError("");
    setStep(next);

    requestAnimationFrame(() => {
      top.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      top.current?.focus({ preventScroll: true });
    });
  }

  function invalidate() {
    setMap(null);
    setReport(null);
    setPreviewConfirmed(false);
    setError("");
  }

  function update<K extends keyof SolarSettings>(
    key: K,
    value: SolarSettings[K],
    camera = false,
  ) {
    invalidate();

    setSettings((previous) => ({
      ...previous,
      [key]: value,
      ...(camera ? { geometry_acknowledged: false } : {}),
    }));
  }

  function setCoordinates(lat: string, lon: string) {
    invalidate();
    setLatitude(lat);
    setLongitude(lon);
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  const validCoordinates =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;

  const point = validCoordinates
    ? { latitude: lat, longitude: lon }
    : null;

  function locationError() {
    if (!validCoordinates) {
      return "Select the photo location or enter valid coordinates.";
    }
    if (!maskUrl) {
      return "Generate a mask on Site analysis, or choose a binary PNG.";
    }
    if (!settings.timezone.trim()) {
      return "Enter the timezone for this location.";
    }

    try {
      new Intl.DateTimeFormat("en", { timeZone: settings.timezone });
    } catch {
      return "Enter a valid timezone, such as Asia/Colombo.";
    }

    return "";
  }

  function validateSettings() {
    const problem = locationError();
    if (problem) return problem;

    const limits: [NumericKey, number, number, string][] = [
      ["altitude_m", -400, 6000, "Altitude"],
      ["year", 2000, 2100, "Year"],
      ["center_x", 0, 1, "Center X"],
      ["center_y", 0, 1, "Center Y"],
      ["radius", 0.001, 0.5, "Horizon radius"],
      ["north_offset_deg", 0, 359.999, "North position"],
      ["baseline_tilt", 0, 90, "Baseline tilt"],
      ["baseline_azimuth", 0, 359.999, "Baseline azimuth"],
      ["max_tilt", 1, 90, "Maximum tilt"],
      ["albedo", 0, 1, "Ground reflectance"],
      ["performance_ratio", 0.01, 1, "Performance ratio"],
    ];

    if (includeEnergy) {
      limits.push(
        ["panel_count", 1, 10000, "Panel count"],
        ["panel_watts", 1, 2000, "Panel watts"],
      );
    }

    for (const [key, min, max, label] of limits) {
      const value = settings[key];
      if (
        value == null ||
        !Number.isFinite(value) ||
        value < min ||
        value > max
      ) {
        return `${label} must be between ${min} and ${max}.`;
      }
    }

    if (!Number.isInteger(settings.year)) return "Enter a whole year.";

    if (
      settings.weather_mode === "historical" &&
      settings.year >= new Date().getFullYear()
    ) {
      return "Historical mode requires a completed previous year.";
    }

    if (
      includeEnergy &&
      !Number.isInteger(settings.panel_count)
    ) {
      return "Panel count must be a whole number.";
    }

    if (!settings.geometry_acknowledged) {
      return "Review and acknowledge the camera settings.";
    }

    if (settings.weather_mode === "csv" && !weather) {
      return "Choose the full-year weather CSV.";
    }

    return "";
  }

  async function run(previewOnly: boolean) {
    if (running.current) return;

    const problem = validateSettings();

    if (problem) {
      setError(problem);
      return;
    }

    if (!previewOnly && (!map || !previewConfirmed)) {
      setError("Check the sun-path preview before calculating.");
      return;
    }

    running.current = true;
    setError("");
    setBusy(previewOnly ? "preview" : "optimize");

    try {
      let mask: Blob;

      if (manualMask) {
        mask = manualMask;
      } else {
        const response = await fetch(maskUrl);
        if (!response.ok) throw new Error("Could not read the selected mask.");
        mask = await response.blob();
      }

      const requestSettings: SolarSettings = {
        ...settings,
        latitude: lat,
        longitude: lon,
        panel_count: includeEnergy ? settings.panel_count : null,
        panel_watts: includeEnergy ? settings.panel_watts : null,
      };

      const response = await calculateSolar(
        requestSettings,
        mask,
        weather,
        previewOnly,
      );

      if (!alive.current) return;

      setMap(response);

      if (previewOnly) {
        setReport(null);
        setPreviewConfirmed(false);
        go("preview");
      } else {
        setReport(response as SolarReport);
        setResultTab("overview");
        go("results");
      }
    } catch (cause) {
      if (alive.current) {
        setError(
          cause instanceof Error ? cause.message : "Calculation failed.",
        );
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(null);
    }
  }

  async function exportPdf() {
    if (!report || exporting) return;

    setExporting(true);
    setError("");

    try {
      const { downloadSolarPdf } = await import("../_lib/solar-pdf");

      await downloadSolarPdf(
        report,
        maskUrl,
        manualMask ? undefined : photoUrl,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "PDF export failed.",
      );
    } finally {
      setExporting(false);
    }
  }

  function numberField(
    key: NumericKey,
    label: string,
    min: number,
    max: number,
    increment = "any",
    camera = false,
  ) {
    const value = settings[key];

    return (
      <Field label={label} key={key}>
        <input
          type="number"
          className={fieldClass}
          min={min}
          max={max}
          step={increment}
          value={
            value == null || !Number.isFinite(value) ? "" : value
          }
          onChange={(event) =>
            update(
              key,
              event.target.value === ""
                ? Number.NaN
                : Number(event.target.value),
              camera,
            )
          }
        />
      </Field>
    );
  }

  const steps: { id: Step; title: string; icon: typeof MapPin }[] = [
    { id: "location", title: "Location", icon: MapPin },
    { id: "settings", title: "Settings", icon: Settings2 },
    { id: "preview", title: "Sun preview", icon: Sun },
    { id: "results", title: "Results", icon: Compass },
  ];

  const stepIndex = steps.findIndex((item) => item.id === step);
  function navigateToStep(next: Step) {
  if (busy || exporting || next === step) return;

  if (next === "location") {
    go("location");
    return;
  }

  const problem = locationError();

  if (problem) {
    setError(problem);
    return;
  }

  if (next === "settings") {
    go("settings");
    return;
  }

  if (next === "preview") {
    if (!map) {
      setError(
        "Open Settings and select “Preview annual sun path” first.",
      );
      return;
    }

    go("preview");
    return;
  }

  if (next === "results") {
    if (!report) {
      setError(
        "Open Sun preview and select “Find best orientation” first.",
      );
      return;
    }

    go("results");
  }
}

  return (
    <div
      ref={top}
      tabIndex={-1}
      className="scroll-mt-20 space-y-5 outline-none"
    >
      <nav
  aria-label="Orientation progress"
  className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-muted/30 p-2"
>
  {steps.map(({ id, title, icon: Icon }, index) => (
    <button
      key={id}
      type="button"
      onClick={() => navigateToStep(id)}
      disabled={!!busy || exporting}
      aria-current={step === id ? "step" : undefined}
      className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-50 sm:text-sm ${
        step === id
          ? "bg-primary text-primary-foreground shadow-sm"
          : "cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {index < stepIndex ? (
        <CheckCircle2 size={16} className="shrink-0" />
      ) : (
        <Icon size={16} className="shrink-0" />
      )}

      <span>{title}</span>
    </button>
  ))}
</nav>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <motion.div
        key={step}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm"
      >
        <div className="h-1 bg-gradient-to-r from-primary via-primary/40 to-transparent" />

        <div className="p-5 sm:p-7">
          {step === "location" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  01 / Your site
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Where was this photo taken?
                </h2>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <LocationPicker
                  point={point}
                  onChange={(value) =>
                    setCoordinates(
                      String(value.latitude),
                      String(value.longitude),
                    )
                  }
                />

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Selected mask</p>

                    {maskUrl ? (
                      <img
                        src={maskUrl}
                        alt="Selected sky and obstacle mask"
                        className="mx-auto my-4 h-40 w-full object-contain"
                      />
                    ) : (
                      <div className="my-4 grid h-40 place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
                        No mask selected
                      </div>
                    )}

                    <p className="mb-3 break-all text-xs text-muted-foreground">
                      {manualMask
                        ? manualMask.name
                        : predictedMask
                          ? "From your site analysis"
                          : "Choose a binary PNG"}
                    </p>

                    <input
                      ref={manualInput}
                      type="file"
                      accept="image/png"
                      className="hidden"
                      aria-label="Choose binary PNG mask"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";

                        if (!file) return;

                        if (
                          !file.name.toLowerCase().endsWith(".png") ||
                          file.size > 20 * 1024 * 1024
                        ) {
                          setError("Choose a PNG mask up to 20 MB.");
                          return;
                        }

                        invalidate();
                        setManualMask(file);
                      }}
                    />

                    <button
                      type="button"
                      className={`${secondaryClass} w-full`}
                      onClick={() => manualInput.current?.click()}
                    >
                      Change mask
                    </button>

                    {manualMask && predictedMask && (
                      <button
                        type="button"
                        className="mt-3 w-full text-xs underline"
                        onClick={() => {
                          invalidate();
                          setManualMask(null);
                        }}
                      >
                        Use model prediction
                      </button>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
                      Black = sky · White = obstacles
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <MapPin size={18} className="mb-2 text-primary" />
                    {point ? (
                      <>
                        <p className="font-medium">Location selected</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {point.latitude.toFixed(6)},{" "}
                          {point.longitude.toFixed(6)}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Select a point on the map.
                      </p>
                    )}
                  </div>
                </aside>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Latitude">
                  <input
                    className={fieldClass}
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    placeholder="Select on map or enter"
                    value={latitude}
                    onChange={(event) =>
                      setCoordinates(event.target.value, longitude)
                    }
                  />
                </Field>

                <Field label="Longitude">
                  <input
                    className={fieldClass}
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    placeholder="Select on map or enter"
                    value={longitude}
                    onChange={(event) =>
                      setCoordinates(latitude, event.target.value)
                    }
                  />
                </Field>

                <Field label="Timezone">
                  <input
                    className={fieldClass}
                    value={settings.timezone}
                    onChange={(event) =>
                      update("timezone", event.target.value)
                    }
                  />
                </Field>

                {numberField(
                  "altitude_m",
                  "Altitude above sea level (m)",
                  -400,
                  6000,
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Sri Lanka: Asia/Colombo. Altitude 0 assumes sea level.
              </p>

              <div className="flex justify-end border-t border-border pt-5">
                <Button
                  onClick={() => {
                    const problem = locationError();
                    if (problem) setError(problem);
                    else go("settings");
                  }}
                >
                  Continue to settings <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {step === "settings" && (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void run(true);
              }}
            >
              <fieldset disabled={!!busy} className="space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    02 / Calculation settings
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Set up your analysis
                  </h2>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-5">
                    <div className="flex items-center gap-2">
                      <Sun size={18} className="text-primary" />
                      <h3 className="font-semibold">Sunlight data</h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          mode: "historical" as const,
                          title: "Historical weather",
                          text: "A full previous year's regional weather.",
                        },
                        {
                          mode: "clear_sky" as const,
                          title: "Clear sky",
                          text: "A cloud-free modelling scenario.",
                        },
                      ].map(({ mode, title, text }) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={settings.weather_mode === mode}
                          onClick={() => {
                            invalidate();
                            setWeather(undefined);
                            setSettings((previous) => ({
                              ...previous,
                              weather_mode: mode,
                              ...(mode === "historical"
                                ? {
                                    interval_minutes: 60,
                                    year: Math.min(
                                      previous.year,
                                      new Date().getFullYear() - 1,
                                    ),
                                  }
                                : {}),
                            }));
                          }}
                          className={`rounded-xl border p-4 text-left transition ${
                            settings.weather_mode === mode
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          <span className="block text-sm font-semibold">
                            {title}
                          </span>
                          <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                            {text}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {numberField("year", "Analysis year", 2000, 2100, "1")}
                      {numberField(
                        "max_tilt",
                        "Maximum allowed tilt (°)",
                        1,
                        90,
                      )}
                    </div>

                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Only use an orientation range your roof or mounting
                      system can support.
                    </p>

                    {settings.weather_mode === "historical" && (
                      <p className="text-xs text-muted-foreground">
                        Weather:{" "}
                        <a
                          href="https://open-meteo.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Open-Meteo
                        </a>{" "}
                        / Copernicus ERA5 · CC BY 4.0
                      </p>
                    )}

                    <details className="rounded-xl border border-border bg-background p-4">
                      <summary className="cursor-pointer text-sm font-medium">
                        Advanced calculation settings
                      </summary>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="Data source">
                          <select
                            className={fieldClass}
                            value={settings.weather_mode}
                            onChange={(event) => {
                              const mode =
                                event.target.value as SolarSettings["weather_mode"];

                              invalidate();
                              setWeather(undefined);
                              setSettings((previous) => ({
                                ...previous,
                                weather_mode: mode,
                                ...(mode === "historical"
                                  ? {
                                      interval_minutes: 60,
                                      year: Math.min(
                                        previous.year,
                                        new Date().getFullYear() - 1,
                                      ),
                                    }
                                  : {}),
                              }));
                            }}
                          >
                            <option value="historical">Historical weather</option>
                            <option value="clear_sky">Clear sky</option>
                            <option value="csv">My weather CSV</option>
                          </select>
                        </Field>

                        <Field label="Time interval">
                          <select
                            className={fieldClass}
                            disabled={settings.weather_mode === "historical"}
                            value={settings.interval_minutes}
                            onChange={(event) =>
                              update(
                                "interval_minutes",
                                Number(event.target.value),
                              )
                            }
                          >
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>60 minutes</option>
                          </select>
                        </Field>

                        {numberField("baseline_tilt", "Baseline tilt (°)", 0, 90)}
                        {numberField(
                          "baseline_azimuth",
                          "Baseline azimuth (°)",
                          0,
                          359.999,
                        )}
                        {numberField(
                          "albedo",
                          "Ground reflectance",
                          0,
                          1,
                          "0.01",
                        )}
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        7° / 180° is this project's comparison reference.
                        It is not a universal best orientation.
                      </p>

                      {settings.weather_mode === "csv" && (
                        <div className="mt-4 space-y-3">
                          <Field label="Full-year weather CSV">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className={fieldClass}
                              onChange={(event) => {
                                invalidate();
                                setWeather(event.target.files?.[0]);
                              }}
                            />
                          </Field>

                          <a
                            className="text-xs underline"
                            href={weatherTemplateUrl(
                              settings.year,
                              settings.interval_minutes,
                              settings.timezone,
                            )}
                          >
                            Download CSV timestamp template
                          </a>

                          <p className="text-xs text-muted-foreground">
                            Required: timestamp, ghi, dni, dhi. Full-year
                            interval means in W/m²; timestamps include offsets.
                          </p>
                        </div>
                      )}
                    </details>
                  </section>

                  <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Compass size={18} className="text-primary" />
                        Camera alignment
                      </h3>

                      <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px]">
                        {settings.geometry_status === "verified"
                          ? "User-declared verified"
                          : "Not verified"}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Requires a level, upward-facing, full 180° fisheye
                      image. Defaults are assumptions, not calibration.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Lens projection">
                        <select
                          className={fieldClass}
                          value={settings.projection}
                          onChange={(event) =>
                            update(
                              "projection",
                              event.target.value as SolarSettings["projection"],
                              true,
                            )
                          }
                        >
                          <option value="equisolid">Equisolid</option>
                          <option value="equidistant">Equidistant</option>
                        </select>
                      </Field>

                      {numberField(
                        "north_offset_deg",
                        "North from image top (°)",
                        0,
                        359.999,
                        "any",
                        true,
                      )}

                      <Field label="Direction around image">
                        <select
                          className={fieldClass}
                          value={String(settings.azimuth_clockwise)}
                          onChange={(event) =>
                            update(
                              "azimuth_clockwise",
                              event.target.value === "true",
                              true,
                            )
                          }
                        >
                          <option value="true">Clockwise</option>
                          <option value="false">Counterclockwise</option>
                        </select>
                      </Field>

                      <Field label="Geometry evidence">
                        <select
                          className={fieldClass}
                          value={settings.geometry_status}
                          onChange={(event) =>
                            update(
                              "geometry_status",
                              event.target.value as SolarSettings["geometry_status"],
                              true,
                            )
                          }
                        >
                          <option value="assumed">Assumed</option>
                          <option value="verified">Verified externally</option>
                        </select>
                      </Field>
                    </div>

                    <details className="rounded-xl border border-border bg-background p-4">
                      <summary className="cursor-pointer text-sm font-medium">
                        Image centre and horizon
                      </summary>

                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        {numberField(
                          "center_x", "Centre X", 0, 1, "0.001", true,
                        )}
                        {numberField(
                          "center_y", "Centre Y", 0, 1, "0.001", true,
                        )}
                        {numberField(
                          "radius", "Horizon radius", 0.001, 0.5, "0.001", true,
                        )}
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        Centre values are relative to width/height minus one.
                        Radius is relative to the shorter image side minus one.
                      </p>
                    </details>

                    <label className="flex items-start gap-3 rounded-xl bg-primary/5 p-4 text-xs leading-relaxed">
                      <input
                        type="checkbox"
                        className="mt-1 accent-primary"
                        checked={settings.geometry_acknowledged}
                        onChange={(event) =>
                          update(
                            "geometry_acknowledged",
                            event.target.checked,
                          )
                        }
                      />
                      <span>
                        I reviewed the lens, horizon and true North settings.
                        If unverified, I understand this is an exploratory
                        result.
                      </span>
                    </label>
                  </section>
                </div>

                <section className="rounded-2xl border border-border p-5">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={includeEnergy}
                      className="accent-primary"
                      onChange={(event) => {
                        invalidate();
                        setIncludeEnergy(event.target.checked);
                      }}
                    />
                    Include an energy estimate
                    <span className="text-xs font-normal text-muted-foreground">
                      Optional
                    </span>
                  </label>

                  {includeEnergy && (
                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      {numberField(
                        "panel_count", "Number of panels", 1, 10000, "1",
                      )}
                      {numberField(
                        "panel_watts", "Rated watts per panel", 1, 2000,
                      )}
                      {numberField(
                        "performance_ratio",
                        "Assumed performance ratio",
                        0.01,
                        1,
                        "0.01",
                      )}
                    </div>
                  )}
                </section>

                <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
                  <Button variant="secondary" onClick={() => go("location")}>
                    <ArrowLeft size={16} /> Location
                  </Button>

                  <Button type="submit">
                    {busy ? (
                      <RefreshCw size={16} className="motion-safe:animate-spin" />
                    ) : (
                      <Sun size={16} />
                    )}
                    {busy ? "Building preview…" : "Preview annual sun path"}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}

          {step === "preview" && map && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  03 / Direction check
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  See the sun across your sky
                </h2>
              </div>

              <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
                <SunOverlay
                  map={map}
                  maskUrl={maskUrl}
                  photoUrl={manualMask ? undefined : photoUrl}
                />

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-border bg-muted/30 p-5">
                    <p className="font-semibold">Before calculating</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Check that the horizon circle and North, East, South
                      and West labels match your photograph.
                    </p>

                    <dl className="mt-5 space-y-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Year</dt>
                        <dd>{settings.year}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Weather</dt>
                        <dd>{settings.weather_mode.replaceAll("_", " ")}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Camera</dt>
                        <dd>
                          {settings.geometry_status === "verified"
                            ? "User verified"
                            : "Assumed"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={previewConfirmed}
                      disabled={!!busy}
                      onChange={(event) =>
                        setPreviewConfirmed(event.target.checked)
                      }
                    />
                    <span>
                      I checked the direction labels and horizon.
                      This confirmation does not calibrate the image.
                    </span>
                  </label>
                </aside>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
                <Button
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => go("settings")}
                >
                  <ArrowLeft size={16} /> Edit settings
                </Button>

                <Button
                  disabled={!!busy || !previewConfirmed}
                  onClick={() => void run(false)}
                >
                  {busy ? (
                    <RefreshCw size={16} className="motion-safe:animate-spin" />
                  ) : (
                    <Compass size={16} />
                  )}
                  {busy ? "Finding your orientation…" : "Find best orientation"}
                </Button>
              </div>

              {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                  Comparing candidate angles using PSO and grid search.
                  Keep this page open.
                </p>
              )}
            </div>
          )}

          {step === "results" && report && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    04 / Your result
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    A direction for your solar setup
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Best candidate under your selected assumptions.
                  </p>
                </div>

                <Button disabled={exporting} onClick={() => void exportPdf()}>
                  {exporting ? (
                    <RefreshCw size={16} className="motion-safe:animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  {exporting ? "Preparing PDF…" : "Download PDF"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
                  {report.settings.year} ·{" "}
                  {report.settings.weather_mode.replaceAll("_", " ")}
                </span>
                <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
                  {report.settings.geometry_status === "verified"
                    ? "Camera: user-declared verified"
                    : "Camera unverified · exploratory"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-border pb-3">
                {[
                  ["overview", "Overview"],
                  ["sun", "Sun path"],
                  ["details", "Comparison & assumptions"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={resultTab === value}
                    onClick={() => setResultTab(value as ResultTab)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      resultTab === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {resultTab === "overview" && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-6">
                      <p className="text-sm text-muted-foreground">
                        Recommended tilt
                      </p>
                      <p className="mt-3 text-5xl font-semibold tracking-tight">
                        {fmt(report.selected.tilt_deg, 1)}°
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Measured from horizontal
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/30 p-6">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Facing direction
                        </p>
                        <p className="mt-3 text-3xl font-semibold">
                          {facing(report.selected.azimuth_deg)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {fmt(report.selected.azimuth_deg, 1)}° azimuth
                        </p>
                      </div>

                      <div
                        className="relative grid size-24 shrink-0 place-items-center rounded-full border border-border bg-background"
                        aria-label={`Panel faces ${fmt(report.selected.azimuth_deg, 1)} degrees clockwise from North`}
                      >
                        <span className="absolute top-1 text-[10px] text-muted-foreground">
                          N
                        </span>
                        <span
                          className="text-4xl text-primary"
                          style={{
                            transform: `rotate(${report.selected.azimuth_deg}deg)`,
                          }}
                          aria-hidden="true"
                        >
                          ↑
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Metric
                      title="Annual irradiation"
                      value={`${fmt(report.selected.poa_kwh_m2)} kWh/m²`}
                      note="On the selected panel plane"
                    />
                    <Metric
                      title="Gain versus your baseline"
                      value={
                        report.gain_percent == null
                          ? "Not defined"
                          : `${fmt(report.gain_percent)}%`
                      }
                      note={
                        report.gain_percent == null
                          ? "Baseline irradiation is zero"
                          : "Same site and calculation assumptions"
                      }
                    />
                    <Metric
                      title={
                        report.capacity_kwp != null
                          ? "Estimated annual energy"
                          : "Baseline irradiation"
                      }
                      value={
                        report.capacity_kwp != null
                          ? `${fmt(report.selected.energy_kwh)} kWh`
                          : `${fmt(report.baseline.poa_kwh_m2)} kWh/m²`
                      }
                      note={
                        report.capacity_kwp != null
                          ? `${fmt(report.capacity_kwp)} kWp · simplified estimate`
                          : "Entered reference orientation"
                      }
                    />
                  </div>

                  <div className="rounded-2xl border border-border p-5">
                    <div className="mb-5 flex flex-wrap justify-between gap-3">
                      <h3 className="font-semibold">Across the year</h3>
                      <p className="text-xs text-muted-foreground">
                        Selected orientation · kWh/m² per month
                      </p>
                    </div>

                    <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
                      {report.monthly.map((month) => {
                        const maximum = Math.max(
                          1,
                          ...report.monthly.map(
                            (value) => value.selected_poa_kwh_m2,
                          ),
                        );

                        return (
                          <div
                            key={month.month}
                            className="text-center"
                            title={`${months[month.month - 1]}: ${fmt(month.selected_poa_kwh_m2)} kWh/m²`}
                          >
                            <div className="flex h-24 items-end rounded-lg bg-muted/40 p-1.5">
                              <div
                                className="w-full rounded-md bg-primary/75"
                                style={{
                                  height: `${Math.max(
                                    0,
                                    (month.selected_poa_kwh_m2 / maximum) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              {months[month.month - 1]}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {resultTab === "sun" && (
                <SunOverlay
                  map={report}
                  maskUrl={maskUrl}
                  photoUrl={manualMask ? undefined : photoUrl}
                />
              )}

              {resultTab === "details" && (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Selected method: {report.selected_method}
                    <br />
                    Weather: {report.weather_source}
                  </p>

                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                      <caption className="p-3 text-left font-semibold">
                        Same mask and irradiance
                      </caption>
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-3">Candidate</th>
                          <th className="p-3">Tilt</th>
                          <th className="p-3">Azimuth</th>
                          <th className="p-3">kWh/m²/year</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: "PSO", value: report.pso.best },
                          { name: "Grid", value: report.grid },
                          { name: "Baseline", value: report.baseline },
                        ].map(({ name, value }) => (
                          <tr key={name} className="border-t border-border">
                            <td className="p-3">{name}</td>
                            <td className="p-3">{fmt(value.tilt_deg, 1)}°</td>
                            <td className="p-3">{fmt(value.azimuth_deg, 1)}°</td>
                            <td className="p-3">{fmt(value.poa_kwh_m2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Grid evaluations: {report.grid.evaluations}.
                    PSO − grid: {fmt(report.pso_minus_grid_kwh_m2, 4)} kWh/m².
                    Agreement checks the optimizer, not real generation accuracy.
                    DNI-weighted blocked fraction:{" "}
                    {fmt(report.dni_weighted_blocked_percent)}%
                    {" "}(not electrical energy loss).
                  </p>

                  <details className="rounded-xl border border-border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Monthly values
                    </summary>

                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr>
                            <th className="p-2">Month</th>
                            <th className="p-2">Selected kWh/m²</th>
                            <th className="p-2">Baseline kWh/m²</th>
                            {report.capacity_kwp != null && (
                              <th className="p-2">Selected kWh</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {report.monthly.map((month) => (
                            <tr
                              key={month.month}
                              className="border-t border-border"
                            >
                              <td className="p-2">
                                {months[month.month - 1]}
                              </td>
                              <td className="p-2">
                                {fmt(month.selected_poa_kwh_m2)}
                              </td>
                              <td className="p-2">
                                {fmt(month.baseline_poa_kwh_m2)}
                              </td>
                              {report.capacity_kwp != null && (
                                <td className="p-2">
                                  {fmt(month.selected_energy_kwh)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <h3 className="text-sm font-semibold">
                      Assumptions and limitations
                    </h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">
                      <li>
                        Estimates depend on the mask, camera geometry and
                        weather assumptions.
                      </li>
                      <li>
                        One photo location does not model whole-array or
                        inter-row shading.
                      </li>
                      {report.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
                <Button
                  variant="secondary"
                  disabled={exporting}
                  onClick={() => go("settings")}
                >
                  <ArrowLeft size={16} /> Edit settings
                </Button>

                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  Estimated performance, not measured generation.
                  Full settings and limitations are included in the PDF.
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}