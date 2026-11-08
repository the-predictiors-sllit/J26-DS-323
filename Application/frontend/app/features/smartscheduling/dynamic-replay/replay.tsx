"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Choice } from "../_milp/components/controls";
import { ScheduleTimeline } from "../_milp/components/schedule-timeline";
import { useScheduler } from "../_milp/state/store";
import { HelpLabel } from "../_shared/components/help-label";
import type { Day } from "../_milp/types";
import { getReplayDates, runReplay, type Replay } from "./actions";
import { EventLog } from "./components/event-log";
import { NotificationCenter } from "./components/notification-center";
import { GenerationSummary } from "./components/generation-summary";
import { PowerPlot } from "./components/power-plot";
import { ReplaySettings } from "./components/replay-settings";
import { SupplySummary } from "./components/supply-summary";
import { playbackFrames } from "./playback";

export function DynamicReplay() {
  const store = useScheduler();
  const [dates, setDates] = useState<string[]>([]);
  const [day, setDay] = useState("");
  const [capacity, setCapacity] = useState("5");
  const [threshold, setThreshold] = useState("0.3");
  const [ratio, setRatio] = useState("0.2");
  const [speed, setSpeed] = useState("250");
  const [mode, setMode] = useState("apply");
  const [detectionMethod, setDetectionMethod] = useState<"latest" | "recent_average" | "recent_average_60">("latest");
  const [result, setResult] = useState<Replay | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [submittedSignature, setSubmittedSignature] = useState("");
  const [pending, transition] = useTransition();
  const inputSignature = JSON.stringify({ day, capacity, threshold, ratio, mode, detectionMethod, settings: store.settings, appliances: store.appliances });
  const savedDay = store.job?.status === "completed" ? store.job.result?.days.find((item) => item.date === day) : undefined;
  const savedPlanMatches = !!savedDay && ["optimal", "partial"].includes(savedDay.status) && savedDay.slots.length === 52 &&
    store.submitted === JSON.stringify({ ...store.settings, appliances: store.appliances }) &&
    store.settings.weather_mode === "historical" && store.settings.prediction_model_minutes === 5 &&
    Math.abs(store.settings.latitude - 5.9977) < 1e-6 && Math.abs(store.settings.longitude - 80.2958) < 1e-6 &&
    Math.abs(store.settings.pv_capacity_kwp - Number(capacity)) < 1e-6;

  useEffect(() => { void getReplayDates().then((r) => { setDates(r.dates); setDay(r.dates.includes("2024-08-17") ? "2024-08-17" : r.dates[0] ?? ""); if (r.error) setError(r.error); }); }, []);
  useEffect(() => {
    if (!playing || !result?.frames.length || cursor >= result.frames.length) return;
    const timer = window.setInterval(() => setCursor((value) => Math.min(value + 1, result.frames.length)), Number(speed));
    return () => window.clearInterval(timer);
  }, [playing, result, speed, cursor]);
  const { finished, frame, history, completed } = playbackFrames(result?.frames ?? [], cursor);
  const isPlaying = playing && !finished;
  const events = history.filter((item) => item.event);
  const rescheduledIds = [...new Set(events.flatMap((event) => event.outcome === "changed" && event.before_schedule && event.after_schedule
    ? event.after_schedule.filter((run) => event.before_schedule?.some((previous) => previous.appliance_id === run.appliance_id && previous.start !== run.start)).map((run) => run.appliance_id)
    : []))];
  const latestProposal = [...history].reverse().find((item) => item.proposal);
  // Only completed slots contribute to the energy estimates.
  const covered = completed.filter((item) => item.actual_kw !== null);
  const estimatedDeficit = (key: "original_load_kw" | "revised_load_kw") => covered.reduce((total, item) => total + Math.max(0, item[key] - item.actual_kw!) * 0.25, 0);
  const revisedDay: Day | null = result?.date && frame ? { date: result.date, status: "optimal", appliance_count: frame.schedule.length, schedule: frame.schedule, slots: [] } : null;
  const originalDay: Day | null = result?.date && result.original_schedule ? { date: result.date, status: "optimal", appliance_count: result.original_schedule.length, schedule: result.original_schedule, slots: [] } : null;
  const run = () => {
    setError(""); setPlaying(false); setResult(null); setCursor(0);
    if (!store.appliances.length) { setError("Add appliances in the appliance library first."); return; }
    if (!day || !Number.isFinite(Number(capacity)) || Number(capacity) <= 0 || Number(threshold) <= 0 || Number(ratio) <= 0 || Number(ratio) > 1) { setError("Enter a date, positive capacity and threshold, and a ratio between 0 and 1."); return; }
    transition(async () => {
      const initial_plan = savedPlanMatches && savedDay ? { slots: savedDay.slots.map(({ timestamp, solar_kw }) => ({ timestamp, solar_kw })), schedule: savedDay.schedule.map(({ appliance_id, start }) => ({ appliance_id, start })) } : undefined;
      const response = await runReplay({ day, latitude: 5.9977, longitude: 80.2958, pv_capacity_kwp: Number(capacity), solar_safety_factor: store.settings.solar_safety_factor, background_load_kw: store.settings.background_load_kw, max_household_power_kw: store.settings.max_household_power_kw, threshold_kw: Number(threshold), threshold_ratio: Number(ratio), apply_rescheduling: mode === "apply", detection_method: detectionMethod, appliances: store.appliances, initial_plan });
      if (response.error) setError(response.error);
      else if (response.result?.status !== "completed") setError(response.result?.reason ?? "No feasible initial schedule.");
      else { setSubmittedSignature(inputSignature); setResult(response.result); setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    });
  };
  return <main className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">SMART SCHEDULING / RESEARCH REPLAY</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Dynamic solar scheduling</h1><p className="mt-2 max-w-3xl text-muted-foreground">Replay historical inverter readings and see how a schedule responds when solar generation falls below its prediction.</p></div><Button variant="outline" nativeButton={false} render={<Link href="/features/smartscheduling/scheduler/appliances" />}>Manage appliances</Button></div>
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><div className="flex gap-2 font-medium"><AlertTriangle className="size-4 shrink-0" /> Research simulation</div><p className="mt-1 text-muted-foreground">This uses retrospective weather and recorded readings. Appliance operation is simulated; it does not control devices. Confirm the site’s PV capacity and inverter power units before interpreting results.</p></div>
    <ReplaySettings value={{ day, capacity, threshold, ratio, mode, detectionMethod }} update={(patch) => { if (patch.day !== undefined) setDay(patch.day); if (patch.capacity !== undefined) setCapacity(patch.capacity); if (patch.threshold !== undefined) setThreshold(patch.threshold); if (patch.ratio !== undefined) setRatio(patch.ratio); if (patch.mode !== undefined) setMode(patch.mode); if (patch.detectionMethod !== undefined) setDetectionMethod(patch.detectionMethod); }} dates={dates} enabledCount={store.appliances.filter((item) => item.enabled).length} safetyFactor={store.settings.solar_safety_factor} backgroundLoad={store.settings.background_load_kw} busy={pending} ready={store.ready} error={error} onRun={run} />
    <p className="rounded-xl border p-4 text-sm text-muted-foreground">{savedPlanMatches ? "A matching 14-day plan was found. Replay will use this date’s saved schedule and solar predictions." : "No matching 14-day plan found. Replay will generate a separate one-day initial plan. To reuse one, generate a historical 5-minute-model plan for this date, the Meepe coordinates and the same capacity and appliance settings."}</p>
    {result && submittedSignature !== inputSignature && <p role="status" className="rounded-xl border p-4 text-sm">Settings or appliances changed. The results below belong to the previous replay; run it again to use the new inputs.</p>}
    {result && frame && originalDay && revisedDay && <>
      <p className="text-sm text-muted-foreground">Initial plan: {result.initial_plan_source === "saved_14_day_plan" ? "selected day from the saved 14-day schedule" : "generated separately for this replay"}.</p>
      <Card><CardHeader><CardTitle>Replay controls</CardTitle><CardDescription>Each step represents 15 minutes; readings are never taken from the future.{finished ? " The final slot has finished; power readings below are from its start." : ""}</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-4"><Button variant="outline" onClick={() => { if (finished) { setCursor(0); setPlaying(true); } else setPlaying(!playing); }}>{isPlaying ? <Pause /> : <Play />}{isPlaying ? "Pause" : finished ? "Play again" : "Play"}</Button><Button variant="outline" onClick={() => { setPlaying(false); setCursor(0); }}><RotateCcw /> Reset</Button><Field className="w-40"><HelpLabel htmlFor="replay-speed" label="Playback speed" help="How quickly the precomputed replay is shown. For example, 4 steps per second displays one simulated hour per second. It does not change the calculated schedule." /><Choice id="replay-speed" value={speed} onChange={setSpeed} options={[{value:"1000",label:"1 step / second"},{value:"250",label:"4 steps / second"},{value:"100",label:"10 steps / second"}]} /></Field><div className="ml-auto"><p className="text-xs text-muted-foreground">Simulated time</p><p className="text-xl font-semibold tabular-nums">{finished ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.parse(frame.timestamp) + 15 * 60_000)) : frame.timestamp.slice(11,16)} <span className="text-sm font-normal text-muted-foreground">+05:30</span></p></div></CardContent></Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Replay results</h2><p className="text-sm text-muted-foreground">Explore the overview, schedule, analysis, and logs.</p></div><NotificationCenter events={events} initialUnscheduled={result.initial_unscheduled ?? result.frames[0]?.unscheduled ?? []} date={result.date ?? day} scheduledCount={result.original_schedule?.length ?? 0} current={frame} stale={submittedSignature !== inputSignature} /></div>
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto" aria-label="Replay result sections"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="schedule">Schedule</TabsTrigger><TabsTrigger value="analysis">Analysis</TabsTrigger><TabsTrigger value="logs">Logs</TabsTrigger></TabsList>
        <TabsContent value="overview" className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardDescription>Predicted power</CardDescription><CardTitle>{frame.predicted_kw.toFixed(2)} kW</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Latest inverter reading</CardDescription><CardTitle>{frame.actual_kw === null ? "Unavailable" : `${frame.actual_kw.toFixed(2)} kW`}</CardTitle><CardDescription>{frame.measurement_age_seconds === null ? "No recent reading" : `${Math.round(frame.measurement_age_seconds)} seconds old`}</CardDescription></CardHeader></Card><Card><CardHeader><CardDescription>Rescheduling events so far</CardDescription><CardTitle>{events.length}</CardTitle></CardHeader></Card></div>
      <Card><CardHeader><CardTitle>Monitoring status</CardTitle><CardDescription>Checks run every 15 simulated minutes; a one-hour cooldown follows each trigger.</CardDescription></CardHeader><CardContent><div className="rounded-xl border bg-muted/30 p-4 text-sm"><p className="font-medium">{frame.event ?? (frame.detection.observed_kw === null ? "Waiting for sufficient measurement data" : frame.detection.threshold_met && frame.detection.cooldown_remaining_minutes ? "Shortfall detected; cooldown is active" : "Monitoring recent generation")}</p><p className="mt-1 text-muted-foreground">{frame.detection.reason}{frame.detection.observed_kw !== null ? ` · Compared ${frame.detection.observed_kw.toFixed(2)} kW observed with ${frame.detection.predicted_kw?.toFixed(2)} kW predicted.` : " No rescheduling check is made without adequate data."}{frame.detection.cooldown_remaining_minutes > 0 ? ` · Cooldown: ${frame.detection.cooldown_remaining_minutes} minutes remaining.` : ""}</p></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Comparison so far</CardTitle><CardDescription>Estimated shortfall using the latest point reading as constant for each completed 15-minute slot. This is not measured energy.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Original plan</p><p className="text-2xl font-semibold">{covered.length ? `${estimatedDeficit("original_load_kw").toFixed(2)} kWh` : "Unavailable"}</p></div><div><p className="text-sm text-muted-foreground">Revised plan</p><p className="text-2xl font-semibold">{covered.length ? `${estimatedDeficit("revised_load_kw").toFixed(2)} kWh` : "Unavailable"}</p></div><div><p className="text-sm text-muted-foreground">Slots with a reading</p><p className="text-2xl font-semibold">{covered.length} / {completed.length}</p></div></CardContent></Card>
      <GenerationSummary completed={completed} />
      <SupplySummary completed={completed} />
        </TabsContent>
        <TabsContent value="schedule" className="space-y-5">
      {!!frame.unscheduled?.length && <Card><CardHeader><CardTitle>Unscheduled appliances</CardTitle><CardDescription>These runs were not placed in this replay. They are not automatically moved to another date.</CardDescription></CardHeader><CardContent><ul className="space-y-2">{frame.unscheduled.map((item) => <li key={item.appliance_id} className="rounded-lg border p-3 text-sm">{item.name} <span className="text-muted-foreground">· Not scheduled</span></li>)}</ul></CardContent></Card>}
      <div className="space-y-3"><h2 className="text-xl font-semibold">Plan at {frame.timestamp.slice(11,16)}</h2><p className="text-sm text-muted-foreground">↻ and the Rescheduled label mark runs changed during this replay.</p><ScheduleTimeline day={revisedDay} changedIds={rescheduledIds} /></div>
      <div className="space-y-3"><h2 className="text-xl font-semibold">Original plan</h2><ScheduleTimeline day={originalDay} /></div>
        </TabsContent>
        <TabsContent value="analysis" className="space-y-5">
          <PowerPlot history={history} />
      {latestProposal?.proposal && <Card><CardHeader><CardTitle>Latest proposed plan</CardTitle><CardDescription>Proposal at {latestProposal.timestamp.slice(11,16)}; detect-only mode has not applied it. To simulate applying proposals, run again in apply mode.</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm">{latestProposal.proposal.map((run) => <li className="flex justify-between gap-4 border-b pb-2" key={run.appliance_id}><span>{run.name}</span><span className="tabular-nums">{run.start.slice(11,16)}–{run.finish_exclusive.slice(11,16)}</span></li>)}</ul></CardContent></Card>}
      <Card><CardHeader><CardTitle>Interpretation</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">{result.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul></CardContent></Card>
        </TabsContent>
        <TabsContent value="logs"><EventLog events={events} /></TabsContent>
      </Tabs>
    </>}
  </main>;
}
