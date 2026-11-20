"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Frame } from "../actions";

type Notice = { id: string; kind: "success" | "warning" | "info"; title: string; detail: string; time?: string };

function notifications(events: Frame[], initialUnscheduled: { appliance_id: string; name: string }[], date: string, scheduledCount: number, current: Frame, stale: boolean): Notice[] {
  const notices: Notice[] = [{ id: "initial", kind: "success", title: "Initial planning completed", detail: `${scheduledCount} appliance run(s) were scheduled for ${date}. ${initialUnscheduled.length} could not be placed. This is a simulation.` }];
  for (const item of initialUnscheduled) notices.push({ id: `initial-${item.appliance_id}`, kind: "warning", title: `${item.name} was not scheduled`, detail: "This appliance could not be placed in the initial plan. It is not automatically moved to another day." });
  for (const event of events) {
    const kind = event.outcome === "unresolved" || event.outcome === "infeasible" ? "warning" : event.outcome === "changed" ? "success" : "info";
    notices.push({ id: `event-${event.timestamp}`, kind, title: event.outcome === "changed" ? "Schedule updated" : event.outcome === "proposed" ? "Schedule proposal available" : event.outcome === "unresolved" || event.outcome === "infeasible" ? "Schedule could not be updated" : "Shortfall detected", detail: event.event ?? "", time: event.timestamp });
    if (event.outcome === "changed" && event.before_schedule && event.after_schedule) {
      for (const run of event.before_schedule.filter((before) => !event.after_schedule?.some((after) => after.appliance_id === before.appliance_id))) notices.push({ id: `removed-${event.timestamp}-${run.appliance_id}`, kind: "warning", title: `${run.name} could not be rescheduled`, detail: "This appliance run was removed from the revised plan. It is not automatically moved to another day.", time: event.timestamp });
    }
  }
  if (stale) notices.push({ id: "stale", kind: "warning", title: "Replay inputs changed", detail: "The results shown belong to an earlier set of inputs. Run the replay again to apply your changes." });
  if (current.detection.observed_kw === null) notices.push({ id: "missing-reading", kind: "warning", title: "Recent measurement unavailable", detail: `${current.detection.reason} A rescheduling check is not made without sufficient data.`, time: current.timestamp });
  return notices.reverse();
}

export function NotificationCenter({ events, initialUnscheduled, date, scheduledCount, current, stale }: { events: Frame[]; initialUnscheduled: { appliance_id: string; name: string }[]; date: string; scheduledCount: number; current: Frame; stale: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const notices = notifications(events, initialUnscheduled, date, scheduledCount, current, stale);
  const selected = notices.find((notice) => notice.id === selectedId);
  return <Sheet onOpenChange={(open) => { if (!open) setSelectedId(null); }}><SheetTrigger render={<Button variant="outline" />}><Bell className="size-4" /> Notifications <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-secondary-foreground">{notices.length}</span></SheetTrigger><SheetContent className="w-full max-w-none sm:max-w-lg"><SheetHeader className="border-b pe-14"><SheetTitle>{selected ? "Notification details" : "Notifications"}</SheetTitle><SheetDescription>{selected ? "Information about this replay notification." : "Warnings and updates from the replay so far."}</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{selected ? <div className="space-y-4"><Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}><ArrowLeft /> All notifications</Button><div><p className="text-xs text-muted-foreground">{selected.time ? `${selected.time.slice(0, 10)} · ${selected.time.slice(11, 16)} · Asia/Colombo` : "Replay update"}</p><h3 className="mt-2 text-base font-semibold">{selected.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.detail}</p></div></div> : <ul className="space-y-2">{notices.map((notice) => <li key={notice.id}><button type="button" onClick={() => setSelectedId(notice.id)} className="flex w-full items-start gap-3 rounded-xl border p-4 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{notice.kind === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> : notice.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : <Info className="mt-0.5 size-4 shrink-0 text-primary" />}<span className="min-w-0 flex-1"><span className="block text-sm font-medium">{notice.title}</span><span className="mt-1 block text-xs text-muted-foreground">{notice.time ? `${notice.time.slice(11, 16)} · ` : ""}{notice.kind === "warning" ? "Warning" : notice.kind === "success" ? "Success" : "Update"}</span></span><ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" /></button></li>)}</ul>}</div></SheetContent></Sheet>;
}
