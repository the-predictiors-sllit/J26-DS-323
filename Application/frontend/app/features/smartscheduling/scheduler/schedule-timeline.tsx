"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Choice } from "./controls";
import {
  applianceColor,
  clock,
  colomboClock,
  dateLabel,
  placeRuns,
} from "./calendar-layout";
import type { Day, Run } from "./types";

const START = 360;
const END = 1140;
const PX_PER_MINUTE = 1.6;
const HEIGHT = (END - START) * PX_PER_MINUTE;
const y = (minute: number) => (minute - START) * PX_PER_MINUTE;
const HOURS = Array.from({ length: 14 }, (_, index) => START + index * 60);
const statusLabel = (status: Day["status"]) =>
  ({
    optimal: "Scheduled",
    idle: "No jobs",
    infeasible: "Infeasible",
    not_proven_optimal: "Unresolved",
  })[status];

export function ScheduleTimeline({
  day,
  days,
  onDateChange,
}: {
  day: Day;
  days?: Day[];
  onDateChange?: (date: string) => void;
}) {
  const available = useMemo(
    () =>
      [...(days?.length ? days : [day])].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    [days, day],
  );
  const [view, setView] = useState("week");
  const [cursor, setCursor] = useState(day.date);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Run | null>(null);
  const [now, setNow] = useState<ReturnType<typeof colomboClock> | null>(null);
  useEffect(() => {
    setCursor(day.date);
  }, [day.date]);
  useEffect(() => {
    const update = () => setNow(colomboClock(new Date()));
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);

  const index = Math.max(
    0,
    available.findIndex((item) => item.date === cursor),
  );
  const first = view === "week" ? Math.floor(index / 7) * 7 : index;
  const count = view === "week" ? 7 : 1;
  const visible = available.slice(first, first + count);
  const last = first + visible.length - 1;
  const go = (date: string) => {
    setCursor(date);
    onDateChange?.(date);
  };
  const previous = () => go(available[Math.max(0, first - count)].date);
  const next = () =>
    go(available[Math.min(available.length - 1, first + count)].date);
  const events = useMemo(
    () =>
      visible.map((item) => {
        try {
          return {
            day: item,
            events: placeRuns(
              item.schedule.filter((run) =>
                run.name
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              ),
              item.date,
            ),
            error: "",
          };
        } catch (error) {
          return {
            day: item,
            events: [],
            error: error instanceof Error ? error.message : "Invalid schedule.",
          };
        }
      }),
    [visible, query],
  );
  const isTodayAvailable =
    !!now && available.some((item) => item.date === now.date);
  const title =
    visible.length === 1
      ? dateLabel(visible[0].date, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : `${dateLabel(visible[0].date, { day: "numeric", month: "short" })} – ${dateLabel(visible.at(-1)!.date, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" />
              Appliance calendar
            </CardTitle>
            <CardDescription className="mt-1">
              Planned runs · Sri Lankan time · 06:00–19:00
            </CardDescription>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            15-minute scheduling
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!isTodayAvailable}
              onClick={() => now && go(now.date)}
            >
              Today
            </Button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Previous calendar period"
                disabled={first === 0}
                onClick={previous}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Next calendar period"
                disabled={last >= available.length - 1}
                onClick={next}
              >
                <ChevronRight />
              </Button>
            </div>
            <h3
              aria-live="polite"
              className="ml-1 text-sm font-semibold sm:text-base"
            >
              {title}
            </h3>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-44 gap-1">
              <FieldLabel htmlFor="calendar-search" className="sr-only">
                Find an appliance
              </FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="calendar-search"
                  className="pl-9"
                  placeholder="Find appliance…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </Field>
            <Field className="w-28 gap-1">
              <FieldLabel htmlFor="calendar-view" className="sr-only">
                Calendar view
              </FieldLabel>
              <Choice
                id="calendar-view"
                value={view}
                onChange={setView}
                options={[
                  { value: "week", label: "Week" },
                  { value: "day", label: "Day" },
                ]}
              />
            </Field>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="max-h-[680px] overflow-auto rounded-2xl border bg-background"
          aria-label="Appliance calendar. Scroll to see all daytime hours."
        >
          <div
            style={{
              minWidth: visible.length > 1 ? 72 + visible.length * 145 : 320,
            }}
          >
            <div
              className="sticky top-0 z-30 grid border-b bg-card"
              style={{
                gridTemplateColumns: `72px repeat(${visible.length}, minmax(0, 1fr))`,
              }}
            >
              <div className="sticky left-0 z-40 flex items-end justify-center border-r bg-card px-1 pb-4 text-[10px] text-muted-foreground">
                GMT+05:30
              </div>
              {visible.map((item) => (
                <div
                  key={item.date}
                  className="border-r px-2 py-3 text-center last:border-r-0"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {dateLabel(item.date, { weekday: "short" })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      go(item.date);
                      setView("day");
                    }}
                    aria-label={`Show ${item.date}`}
                    className={`mx-auto my-1 flex size-9 items-center justify-center rounded-full text-xl font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${now?.date === item.date ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {Number(item.date.slice(8))}
                  </button>
                  <p
                    className={`text-[10px] ${["infeasible", "not_proven_optimal"].includes(item.status) ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {statusLabel(item.status)}
                  </p>
                </div>
              ))}
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `72px repeat(${visible.length}, minmax(0, 1fr))`,
              }}
            >
              <div
                className="sticky left-0 z-20 border-r bg-card"
                style={{ height: HEIGHT + 24 }}
              >
                {HOURS.map((minute) => (
                  <span
                    key={minute}
                    className="absolute right-3 text-[10px] tabular-nums text-muted-foreground"
                    style={{ top: y(minute) + 6 }}
                  >
                    {clock(minute)}
                  </span>
                ))}
              </div>
              {events.map(({ day: item, events: runs, error }) => (
                <div
                  key={item.date}
                  className="relative border-r last:border-r-0"
                  style={{ height: HEIGHT + 24 }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0"
                    style={{
                      height: HEIGHT,
                      backgroundImage:
                        "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                      backgroundSize: `100% ${15 * PX_PER_MINUTE}px`,
                    }}
                  />
                  {(error || !item.schedule.length) && (
                    <div className="sticky top-28 z-10 mx-2 mt-3 rounded-lg border bg-card/95 p-3 text-xs leading-5 text-muted-foreground">
                      {error || item.reason || "No runs scheduled."}
                    </div>
                  )}
                  {!!query && !!item.schedule.length && !runs.length && (
                    <div className="p-3 text-xs text-muted-foreground">
                      No matching appliances.
                    </div>
                  )}
                  {runs.map(({ run, start, end, lane, lanes }) => {
                    const color = applianceColor(run.appliance_id);
                    const compact = end - start < 30;
                    return (
                      <button
                        key={`${run.appliance_id}-${run.start}`}
                        type="button"
                        onClick={() => setSelected(run)}
                        aria-label={`${run.name}, ${clock(start)} to ${clock(end)}, ${run.power_kw} kilowatts. Show details.`}
                        title={`${run.name} · ${clock(start)}–${clock(end)} · ${run.power_kw} kW`}
                        className="absolute z-10 flex flex-col items-start justify-start overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left shadow-sm outline-none transition-shadow hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring"
                        style={{
                          top: y(start) + 1,
                          height: Math.max(20, y(end) - y(start) - 2),
                          left: `calc(${(lane / lanes) * 100}% + 3px)`,
                          width: `calc(${100 / lanes}% - 6px)`,
                          backgroundColor: `color-mix(in oklab, ${color} 19%, var(--card))`,
                          borderColor: color,
                          color: "var(--foreground)",
                        }}
                      >
                        <p className="w-full truncate text-[11px] font-semibold">
                          {run.name}
                        </p>
                        {!compact && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {clock(start)}–{clock(end)}
                          </p>
                        )}
                        {end - start >= 45 && (
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {run.power_kw} kW · {run.duration_minutes} min
                          </p>
                        )}
                      </button>
                    );
                  })}
                  {now?.date === item.date &&
                    now.minute >= START &&
                    now.minute < END && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
                        style={{ top: y(now.minute) }}
                      >
                        <span className="absolute -left-1 -top-1.5 size-2.5 rounded-full bg-destructive" />
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Select an event for details. Overlapping appliances appear side by
          side. These are planned runs; no actual completion is measured.
        </p>
      </CardContent>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Planned appliance operation · Asia/Colombo
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-secondary p-4">
                <p className="text-sm text-muted-foreground">
                  {dateLabel(colomboClock(new Date(selected.start)).date, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xl font-semibold">
                  <Clock3 className="size-5 text-primary" />
                  {clock(colomboClock(new Date(selected.start)).minute)}–
                  {clock(
                    colomboClock(new Date(selected.finish_exclusive)).minute,
                  )}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Power</dt>
                  <dd className="mt-1 flex items-center gap-1 font-medium">
                    <Zap className="size-3 text-primary" />
                    {selected.power_kw} kW
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd className="mt-1 font-medium">
                    {selected.duration_minutes} min
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Energy</dt>
                  <dd className="mt-1 font-medium">
                    {selected.energy_kwh.toFixed(3)} kWh
                  </dd>
                </div>
              </dl>
              <p className="text-xs leading-5 text-muted-foreground">
                Changing a run requires a new optimization. Dragging and
                resizing are disabled.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
