"use client";
import { useEffect, useState, useTransition } from "react";
import { LocationPicker } from "./location-picker";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Download,
  Settings2,
  Sun,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Choice } from "./controls";
import { startScheduler, pollScheduler } from "./actions";
import { downloadCsv } from "./csv";
import { useScheduler } from "./store";
import { addDays, type Settings } from "./types";
import { ScheduleTimeline } from "./schedule-timeline";
import { PowerChart } from "./power-chart";

export function SchedulerDashboard() {
  const store = useScheduler();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const busy =
    pending ||
    store.job?.status === "queued" ||
    store.job?.status === "running";
  const payload = { ...store.settings, appliances: store.appliances };
  const signature = JSON.stringify(payload);
  const days = store.job?.result?.days ?? [];
  const day = days.find((item) => item.date === selected) ?? days[0];
  const stale = !!store.submitted && store.submitted !== signature;
  const jobId = store.job?.job_id;
  useEffect(() => {
    if (!jobId || !["queued", "running"].includes(store.job?.status ?? ""))
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      const job = await pollScheduler(jobId!);
      if (stopped) return;
      attempts++;
      store.update({ job });
      if (["queued", "running"].includes(job.status)) {
        if (attempts >= 300) {
          store.update({
            job: {
              ...job,
              status: "failed",
              error:
                "Polling stopped after 15 minutes. The backend may still be processing this job.",
            },
          });
          return;
        }
        timer = setTimeout(poll, 3000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Resume once per job ID; the loop receives all subsequent status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    store.update({ settings: { ...store.settings, [key]: value } });
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!store.appliances.some((item) => item.enabled)) {
      setError("Add and enable at least one appliance first.");
      return;
    }
    startTransition(async () => {
      const result = await startScheduler(payload);
      if (result.error || !result.job_id) {
        setError(result.error ?? "Could not create schedule.");
        return;
      }
      store.update({
        submitted: signature,
        job: {
          job_id: result.job_id,
          status: "queued",
          progress: 0,
          message: "Queued",
        },
      });
    });
  }
  function numeric(
    key:
      | "latitude"
      | "longitude"
      | "pv_capacity_kwp"
      | "solar_safety_factor"
      | "background_load_kw",
    label: string,
    min?: number,
    max?: number,
  ) {
    return (
      <Field>
        <FieldLabel htmlFor={key}>{label}</FieldLabel>
        <Input
          id={key}
          type="number"
          step="any"
          required
          min={min}
          max={max}
          value={store.settings[key]}
          onChange={(event) => set(key, Number(event.target.value))}
          className="h-11 rounded-xl"
        />
      </Field>
    );
  }
  return (
    <main className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground">
            FORECAST → SOLAR → SCHEDULE
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Make room for the sun.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            A 14-day solar-only plan for your appliances. Forecast weather
            becomes solar predictions, then a constrained schedule for each day.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href="/features/smartscheduling/scheduler/appliances" />
          }
        >
          Manage appliances <ArrowRight className="size-4" />
        </Button>
      </header>
      {store.storageError && <FieldError>{store.storageError}</FieldError>}
      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-primary" /> Plan settings
            </CardTitle>
            <CardDescription>
              {store.appliances.filter((item) => item.enabled).length} enabled
              appliances · 15-minute scheduling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <fieldset disabled={busy || !store.ready} className="space-y-5">
                <FieldGroup className="grid grid-cols-2 gap-3">
                  {numeric("latitude", "Latitude", -90, 90)}
                  {numeric("longitude", "Longitude", -180, 180)}
                </FieldGroup>
                <LocationPicker
  latitude={store.settings.latitude}
  longitude={store.settings.longitude}
  disabled={busy || !store.ready}
  onChange={({ latitude, longitude }) => {
    store.update({
      settings: {
        ...store.settings,
        latitude,
        longitude,
      },
    });
  }}
/>
                {numeric(
                  "pv_capacity_kwp",
                  "Installed capacity (kWp)",
                  0.001,
                  1000,
                )}
                <Field>
                  <FieldLabel htmlFor="start_date">
                    First forecast date
                  </FieldLabel>
                  <Input
                    id="start_date"
                    type="date"
                    required
                    min={store.today}
                    max={addDays(store.today, 2)}
                    value={store.settings.start_date}
                    onChange={(event) => set("start_date", event.target.value)}
                    className="h-11 rounded-xl"
                  />
                  <FieldDescription className="text-xs">
                    {store.settings.start_date
                      ? `${store.settings.start_date} through ${addDays(store.settings.start_date, 13)}`
                      : "Choose a date"}
                    . Tomorrow is the default so every operating slot is in the
                    future.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="prediction-model">
                    Solar prediction model
                  </FieldLabel>
                  <Choice
                    id="prediction-model"
                    value={String(store.settings.prediction_model_minutes)}
                    disabled={busy || !store.ready}
                    options={[
                      { value: "15", label: "15-minute model" },
                      { value: "5", label: "5-minute model" },
                    ]}
                    onChange={(value) =>
                      set("prediction_model_minutes", Number(value) as 5 | 15)
                    }
                  />
                  <FieldDescription className="text-xs">
                    Both produce 15-minute schedules. For the 5-minute model,
                    each scheduling slot uses the minimum of three predictions.
                  </FieldDescription>
                </Field>
                {numeric(
                  "solar_safety_factor",
                  "Usable solar fraction",
                  0.01,
                  1,
                )}
                <p className="-mt-3 text-xs text-muted-foreground">
                  0.90 reserves 10% of predicted solar.
                </p>
                <details className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Additional power constraints
                  </summary>
                  <div className="mt-4 space-y-4">
                    {numeric(
                      "background_load_kw",
                      "Other household load (kW)",
                      0,
                    )}
                    <Field>
                      <FieldLabel htmlFor="household-limit">
                        Household limit (kW, optional)
                      </FieldLabel>
                      <Input
                        id="household-limit"
                        type="number"
                        min="0.001"
                        step="any"
                        value={store.settings.max_household_power_kw ?? ""}
                        onChange={(event) =>
                          set(
                            "max_household_power_kw",
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                        className="h-11 rounded-xl"
                      />
                    </Field>
                  </div>
                </details>
                <Button
                  type="submit"
                  disabled={busy || !store.ready}
                  className="h-12 w-full gap-2 rounded-xl"
                >
                  {busy ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  <span>
                    {busy ? "Building your plan…" : "Generate 14-day schedule"}
                  </span>
                </Button>
              </fieldset>
            </form>
            {(error || store.job?.error) && (
              <FieldError className="mt-4">
                {error || store.job?.error}
              </FieldError>
            )}
            {busy && (
              <div role="status" className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {store.job?.message ?? "Submitting request…"}
                </p>
                <progress
                  className="h-2 w-full accent-primary"
                  max={100}
                  value={store.job?.progress ?? 0}
                  aria-label="Schedule generation progress"
                />
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              No grid supply or home battery. If all jobs cannot fit, the day is
              marked infeasible. Forecast-based planning cannot guarantee zero
              real grid import.
            </p>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-5">
          {!days.length ? (
            <Card>
              <CardContent className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
                <Sun className="mb-5 size-16 text-primary/60" strokeWidth={1} />
                <h2 className="text-xl font-semibold">
                  Your days, planned around solar.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  Add your appliances, choose your location and capacity, then
                  generate a plan. The timeline will show when each appliance
                  can run.
                </p>
                <Button
                  className="mt-6"
                  variant="secondary"
                  nativeButton={false}
                  render={
                    <Link href="/features/smartscheduling/scheduler/appliances" />
                  }
                >
                  Add appliances <ArrowRight className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {stale && (
                <div
                  role="status"
                  className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
                >
                  Settings or appliances changed. This is the previous plan;
                  regenerate to apply your changes.
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[
                  [
                    "Optimal days",
                    days.filter((item) => item.status === "optimal").length,
                  ],
                  [
                    "Need attention",
                    days.filter((item) =>
                      ["infeasible", "not_proven_optimal"].includes(
                        item.status,
                      ),
                    ).length,
                  ],
                  [
                    "Idle days",
                    days.filter((item) => item.status === "idle").length,
                  ],
                ].map(([label, value]) => (
                  <Card key={label}>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-2 text-3xl font-semibold tabular-nums">
                        {value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="size-4 text-primary" /> Explore a
                      day
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        downloadCsv("solar-appliance-schedule.csv", [
                          [
                            "date",
                            "status",
                            "appliance_id",
                            "name",
                            "start",
                            "finish",
                            "power_kw",
                            "energy_kwh",
                          ],
                          ...days.flatMap((item) =>
                            item.schedule.length
                              ? item.schedule.map((run) => [
                                  item.date,
                                  item.status,
                                  run.appliance_id,
                                  run.name,
                                  run.start,
                                  run.finish_exclusive,
                                  run.power_kw,
                                  run.energy_kwh,
                                ])
                              : [
                                  [
                                    item.date,
                                    item.status,
                                    "",
                                    item.reason ?? "",
                                    "",
                                    "",
                                    "",
                                    "",
                                  ],
                                ],
                          ),
                        ])
                      }
                    >
                      <Download className="size-3.5" /> Export CSV
                    </Button>
                  </div>
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                    {days.map((item) => (
                      <Button
                        key={item.date}
                        type="button"
                        variant={
                          day?.date === item.date ? "default" : "outline"
                        }
                        onClick={() => setSelected(item.date)}
                        className="h-auto shrink-0 flex-col gap-1 rounded-xl px-4 py-3"
                        aria-pressed={day?.date === item.date}
                      >
                        <span className="text-xs">{item.date.slice(5)}</span>
                        <span className="text-[10px] font-normal">
                          {item.status === "not_proven_optimal"
                            ? "Unresolved"
                            : item.status}
                        </span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {day && (
                <>
                  <ScheduleTimeline
                    day={day}
                    days={days}
                    onDateChange={setSelected}
                  />
                  <PowerChart day={day} />
                  {day.metrics && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        [
                          "Peak planned load",
                          `${day.metrics.peak_load_kw.toFixed(2)} kW`,
                        ],
                        [
                          "Planned load energy",
                          `${day.metrics.load_energy_kwh.toFixed(2)} kWh`,
                        ],
                        [
                          "Weighted start shift",
                          `${day.metrics.weighted_start_shift_minutes}`,
                        ],
                      ].map(([label, value]) => (
                        <Card key={label}>
                          <CardContent>
                            <p className="text-xs text-muted-foreground">
                              {label}
                            </p>
                            <p className="mt-2 text-xl font-semibold">
                              {value}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <div className="rounded-2xl bg-secondary/60 p-5">
            <p className="text-sm font-medium">
              Next research phase: deviation-driven rescheduling
            </p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              TODO: compare measured generation with the forecast, detect
              significant deviation, preserve completed/running jobs, and
              reschedule only eligible future work. This version creates plans
              only.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
