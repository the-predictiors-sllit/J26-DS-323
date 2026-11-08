"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRightLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Frame } from "../actions";
import type { Run } from "../../_milp/types";

function Plan({ title, runs, changed, removed }: { title: string; runs: Run[]; changed: Set<string>; removed: Set<string> }) {
  return <section className="min-w-0 rounded-xl border p-4"><h4 className="font-semibold">{title}</h4>{runs.length ? <ul className="mt-3 space-y-2">{runs.map((run) => <li key={run.appliance_id} className={`rounded-lg border p-3 text-sm ${changed.has(run.appliance_id) ? "border-primary bg-primary/10" : "bg-muted/30"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{run.name}</span>{changed.has(run.appliance_id) && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{removed.has(run.appliance_id) ? "Not scheduled after" : "Rescheduled"}</span>}</div><p className="mt-1 tabular-nums text-muted-foreground">{run.start.slice(11, 16)}–{run.finish_exclusive.slice(11, 16)} · {run.power_kw} kW</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No appliances in this plan.</p>}</section>;
}

/** The log contains only events reached by the replay. */
export function EventLog({ events }: { events: Frame[] }) {
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const selected = events.find((event) => event.timestamp === selectedTime);
  const before = selected?.before_schedule ?? [];
  const after = selected?.after_schedule ?? [];
  const changed = new Set(before.filter((run) => after.find((item) => item.appliance_id === run.appliance_id)?.start !== run.start).map((run) => run.appliance_id));
  const removed = before.filter((run) => !after.some((item) => item.appliance_id === run.appliance_id));
  const removedIds = new Set(removed.map((run) => run.appliance_id));
  return <Card><CardHeader><CardTitle>Replay logs</CardTitle><CardDescription>Each entry records the detected shortfall and the decision at that time.</CardDescription></CardHeader><CardContent>{events.length ? <ul className="space-y-3">{events.slice().reverse().map((event) => <li key={event.timestamp} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3">{event.outcome === "unresolved" || event.outcome === "infeasible" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> : <Info className="mt-0.5 size-4 shrink-0 text-primary" />}<div><p className="text-sm font-medium"><time className="tabular-nums">{event.timestamp.slice(11, 16)}</time> · {event.event}</p><p className="mt-1 text-xs text-muted-foreground">{event.detection.reason} · {event.detection.samples} sample(s) · predicted {event.detection.predicted_kw?.toFixed(2) ?? "—"} kW · observed {event.detection.observed_kw?.toFixed(2) ?? "—"} kW</p></div></div>{event.before_schedule && event.after_schedule && <Button size="sm" variant="outline" onClick={() => setSelectedTime(event.timestamp)}><ArrowRightLeft /> Compare plans</Button>}</div></li>)}</ul> : <p className="text-sm text-muted-foreground">No events have occurred yet.</p>}</CardContent>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedTime(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Schedule comparison · {selected?.timestamp.slice(11, 16)}</DialogTitle><DialogDescription>{selected?.outcome === "proposed" ? "Proposed changes were not applied in detect-only mode." : "Changes made at this event. Running and completed jobs remain fixed."} Changed runs are highlighted and labelled.</DialogDescription></DialogHeader><div className="grid gap-4 md:grid-cols-2"><Plan title="Before" runs={before} changed={changed} removed={removedIds} /><Plan title={selected?.outcome === "proposed" ? "Proposed" : "After"} runs={after} changed={changed} removed={removedIds} /></div>{removed.length > 0 && <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">Could not be rescheduled: {removed.map((run) => run.name).join(", ")}.</p>}</DialogContent></Dialog>
  </Card>;
}
