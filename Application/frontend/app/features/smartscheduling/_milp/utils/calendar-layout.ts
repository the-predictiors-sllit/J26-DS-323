import type { Run } from "../types";

const localFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function colomboClock(instant: Date) {
  const parts = localFormat.formatToParts(instant);
  const field = (type: string) => parts.find(part => part.type === type)!.value;
  return {
    date: `${field("year")}-${field("month")}-${field("day")}`,
    minute: Number(field("hour")) * 60 + Number(field("minute")),
  };
}

export function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export type PlacedRun = { run: Run; start: number; end: number; lane: number; lanes: number };

// Connected groups of overlapping runs share horizontal space. End is exclusive:
// 10:00–11:00 and 11:00–12:00 may use the same lane.
export function placeRuns(runs: Run[], date: string): PlacedRun[] {
  const midnight = Date.parse(`${date}T00:00:00+05:30`);
  const sorted = runs.map(run => {
    const start = (Date.parse(run.start) - midnight) / 60000;
    const end = (Date.parse(run.finish_exclusive) - midnight) / 60000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 360 || end > 1140 || end <= start) {
      throw new Error(`Invalid daytime schedule for ${run.name}.`);
    }
    return { run, start, end, lane: 0, lanes: 1 };
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.run.appliance_id.localeCompare(b.run.appliance_id));

  const result: PlacedRun[] = [];
  let cluster: PlacedRun[] = [];
  let clusterEnd = -Infinity;
  function flush() {
    const ends: number[] = [];
    for (const event of cluster) {
      let lane = ends.findIndex(end => end <= event.start);
      if (lane === -1) lane = ends.length;
      ends[lane] = event.end;
      event.lane = lane;
    }
    result.push(...cluster.map(event => ({ ...event, lanes: ends.length })));
    cluster = [];
  }
  for (const event of sorted) {
    if (event.start >= clusterEnd) { flush(); clusterEnd = -Infinity; }
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event.end);
  }
  flush();
  return result;
}

export function applianceColor(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `var(--chart-${Math.abs(hash) % 5 + 1})`;
}
