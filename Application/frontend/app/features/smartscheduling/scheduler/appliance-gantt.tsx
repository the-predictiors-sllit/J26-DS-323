"use client";

import { useCallback, useMemo, useState, type ComponentProps, type CSSProperties } from "react";
import { Gantt, Willow } from "@svar-ui/react-gantt";
import { Clock3, Expand, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Choice } from "./controls";
import { ganttWallTime, clockLabel } from "./schedule-time";
import type { Day, Run } from "./types";
import "@svar-ui/react-gantt/all.css";
import "./scheduler-gantt.css";

type TaskBarProps = ComponentProps<NonNullable<ComponentProps<typeof Gantt>["taskTemplate"]>>;

export default function ApplianceGantt({ day }: { day: Day }) {
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState("30");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Run | null>(null);
  const tasks = useMemo(() => day.schedule.map((run, index) => ({
    id: run.appliance_id, text: run.name,
    start: ganttWallTime(run.start), end: ganttWallTime(run.finish_exclusive),
    // End is exclusive. Do not also provide duration to SVAR.
    type: "task", power: `${run.power_kw} kW`, runtime: `${run.duration_minutes} min`,
    window: `${clockLabel(ganttWallTime(run.start))}–${clockLabel(ganttWallTime(run.finish_exclusive))}`,
    tone: `var(--chart-${index % 5 + 1})`, run,
  })).filter(task => task.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [day.schedule, query]);

  const TaskBar = useCallback(({ data }: TaskBarProps) => {
    const run = data.run as Run;
    return <button type="button" className="solar-run-bar" style={{ "--run-color": data.tone } as CSSProperties}
      onClick={event => { event.stopPropagation(); setSelected(run); }}
      aria-label={`${run.name}, ${run.duration_minutes} minutes, ${run.power_kw} kilowatts. Show run details.`}>
      <span className="solar-run-accent" aria-hidden="true" /><span className="solar-run-content"><span className="solar-run-title">{run.name}</span><span className="solar-run-meta">{run.duration_minutes} min · {run.power_kw} kW</span></span>
    </button>;
  }, []);

  const columns: ComponentProps<typeof Gantt>["columns"] = [
    { id: "text", header: "Appliance", width: 200, flexgrow: 1 },
    { id: "window", header: "Scheduled", width: 115 },
    { id: "power", header: "Power", width: 85 },
  ];
  const scales = [
    { unit: "hour", step: 1, format: (date: Date) => `${String(date.getHours()).padStart(2, "0")}:00` },
    { unit: "minute", step: Number(zoom), format: clockLabel },
  ];

  return <div className={expanded ? "fixed inset-3 z-40 flex flex-col rounded-3xl border bg-background p-5 shadow-2xl sm:inset-6" : "min-w-0"}>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="flex flex-wrap items-end gap-3">
      <Field className="w-52 gap-1.5"><FieldLabel htmlFor="schedule-search" className="text-xs">Find an appliance</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input id="schedule-search" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" placeholder="Search this day…" /></div></Field>
      <Field className="w-40 gap-1.5"><FieldLabel htmlFor="schedule-zoom" className="text-xs">Timeline detail</FieldLabel><Choice id="schedule-zoom" value={zoom} onChange={setZoom} options={[{ value: "15", label: "15-minute cells" }, { value: "30", label: "30-minute cells" }, { value: "60", label: "Hourly cells" }]} /></Field>
    </div><Button type="button" variant="outline" size="sm" onClick={() => setExpanded(value => !value)} aria-pressed={expanded}><Expand className="size-4" />{expanded ? "Close expanded view" : "Expand timeline"}</Button></div>

    <div className="solar-gantt overflow-hidden rounded-2xl border" style={{ height: expanded ? "100%" : Math.max(280, Math.min(620, tasks.length * 76 + 100)), minHeight: 260 }}>
      {tasks.length ? <Willow fonts={false}><Gantt key={`${day.date}-${zoom}`} tasks={tasks} links={[]} columns={columns} taskTemplate={TaskBar}
        start={ganttWallTime(`${day.date}T06:00:00+05:30`)} end={ganttWallTime(`${day.date}T19:00:00+05:30`)}
        scales={scales} lengthUnit="minute" durationUnit="hour" cellWidth={zoom === "15" ? 52 : zoom === "30" ? 82 : 110}
        cellHeight={76} scaleHeight={30} gridWidth={400} cellBorders="full" readonly />
      </Willow> : <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">No appliance matches your search.</div>}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Planned operation · select a bar for details</span><span>All times are Sri Lankan time · changes require a new optimization</span></div>

    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent>
      <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>Scheduled operation on {day.date} · Asia/Colombo</DialogDescription></DialogHeader>
      {selected && <div className="space-y-4"><div className="rounded-2xl bg-secondary p-4"><p className="flex items-center gap-2 text-lg font-semibold"><Clock3 className="size-5 text-primary" />{clockLabel(ganttWallTime(selected.start))}–{clockLabel(ganttWallTime(selected.finish_exclusive))}</p><p className="mt-1 text-sm text-muted-foreground">Continuous run for {selected.duration_minutes} minutes</p></div><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Power</dt><dd className="mt-1 flex items-center gap-1 font-medium"><Zap className="size-4 text-primary" />{selected.power_kw} kW</dd></div><div><dt className="text-muted-foreground">Planned energy</dt><dd className="mt-1 font-medium">{selected.energy_kwh.toFixed(3)} kWh</dd></div></dl><p className="text-xs leading-5 text-muted-foreground">This is a forecast-based plan. Live operation and completion are not measured in this version.</p></div>}
    </DialogContent></Dialog>
  </div>;
}
