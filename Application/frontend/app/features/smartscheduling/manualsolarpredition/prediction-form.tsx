"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, CloudSun, Download, LoaderCircle, MapPin, Plus, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { predictSolar } from "./actions";
import { addDays, FIELDS, MODELS, schedule, timeLabel, timeOptions, type Model, type Prediction, type PredictionState, type Submission, type Values } from "./config";

const EXAMPLE = Object.fromEntries(FIELDS.map((field) => [field.name, field.value])) as Values;
const EMPTY = Object.fromEntries(FIELDS.map((field) => [field.name, ""])) as Values;
const fmt = (value: number, digits = 3) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
const stampLabel = (value: string) => `${value.slice(0, 10)} · ${value.slice(11, 16)}`;

export function SolarPredictionForm({ initialDate }: { initialDate: string }) {
  const [model, setModel] = useState<Model>("15");
  const [source, setSource] = useState<Submission["source"]>("manual");
  const [period, setPeriod] = useState<Submission["period"]>("single");
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("08:15");
  const [endTime, setEndTime] = useState("09:00");
  const [values, setValues] = useState<Values>({ ...EXAMPLE });
  const [manualRows, setManualRows] = useState<Record<string, Values>>({});
  const [selectedSlot, setSelectedSlot] = useState("");
  const [state, action, pending] = useActionState<PredictionState, FormData>(predictSolar, {});
  const draft: Submission = { model, source, period, startDate, endDate, startTime, endTime, values, manualRows };
  let times: string[] = [];
  let scheduleError = "";
  try { times = schedule(draft); } catch (error) { scheduleError = error instanceof Error ? error.message : "Invalid range."; }
  const slot = times.includes(selectedSlot) ? selectedSlot : times[0] ?? "";
  const rangeManual = source === "manual" && period === "range";
  const activeWeather = rangeManual ? manualRows[slot] ?? EMPTY : values;
  const activeRows = rangeManual ? Object.fromEntries(times.filter((time) => manualRows[time]).map((time) => [time, manualRows[time]])) : {};
  const submission = JSON.stringify({ ...draft, manualRows: activeRows });
  const current = state.requestKey === submission;
  const predictions = current && !pending ? state.predictions : undefined;
  const completed = times.filter((time) => FIELDS.filter((field) => field.group !== "site").every((field) => manualRows[time]?.[field.name]?.trim())).length;
  const minDate = source === "forecast" ? initialDate : source === "historical" ? "1940-01-01" : undefined;
  const maxDate = source === "forecast" ? addDays(initialDate, 15) : source === "historical" ? initialDate : undefined;

  function changeModel(next: Model) {
    const snap = (value: string) => timeLabel(Math.min(1140, Math.max(360, Math.ceil((Number(value.slice(0, 2)) * 60 + Number(value.slice(3))) / MODELS[next].interval) * MODELS[next].interval)));
    setModel(next); setStartTime(snap(startTime)); setEndTime(snap(endTime));
  }

  function setWeather(name: keyof Values, value: string) {
    if (rangeManual) setManualRows((previous) => ({ ...previous, [slot]: { ...(previous[slot] ?? EMPTY), [name]: value } }));
    else setValues((previous) => ({ ...previous, [name]: value }));
  }

  function fields(group: string, cols = "sm:grid-cols-3") {
    const site = group === "site";
    return <div className={`grid gap-4 ${cols}`}>{FIELDS.filter((field) => field.group === group).map((field) => (
      <div key={field.name} className="space-y-2"><Label htmlFor={field.name} className="text-xs text-muted-foreground">{field.label}</Label><div className="relative">
        <Input id={field.name} type="number" step="any" required={!rangeManual || site} min={field.min} max={field.max} value={(site ? values : activeWeather)[field.name]}
          onChange={(event) => site ? setValues((previous) => ({ ...previous, [field.name]: event.target.value })) : setWeather(field.name, event.target.value)}
          className="h-11 rounded-xl bg-background pr-16 tabular-nums" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{field.unit}</span>
      </div></div>
    ))}</div>;
  }

  function selectTime(id: string, label: string, value: string, onChange: (value: string) => void) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)} className="w-full [&_select]:h-11 [&_select]:rounded-xl">{timeOptions(model).map((time) => <NativeSelectOption key={time} value={time}>{time}</NativeSelectOption>)}</NativeSelect></div>;
  }

  return <main className="mx-auto max-w-7xl space-y-7 px-1 py-5 text-foreground sm:px-4">
    <header className="flex flex-wrap items-end justify-between gap-4"><div className="space-y-3"><p className="text-xs font-medium tracking-widest text-muted-foreground">SMART SCHEDULING / SOLAR LAB</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your solar, a little clearer.</h1><p className="max-w-xl text-sm leading-6 text-muted-foreground">Explore a moment or plan across days. Bring your weather data, or let Open-Meteo supply it.</p></div><span className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs text-muted-foreground"><MapPin className="size-3.5 text-primary" /> Sri Lanka · UTC +05:30</span></header>

    <form action={action}>
      <input type="hidden" name="submission" value={submission} />
      <fieldset disabled={pending} className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><legend className="sr-only">Prediction settings</legend>
        <div className="min-w-0 space-y-5">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CloudSun className="size-4 text-primary" /> Choose your weather source</CardTitle><CardDescription>Manual inputs or weather fetched for your location.</CardDescription></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Weather source">{([["manual", "Manual", "Enter your own conditions"], ["forecast", "Open-Meteo forecast", "Today + next 15 dates"], ["historical", "Open-Meteo historical", "Past modeled weather"]] as const).map(([key, title, description]) => <label key={key} className={`cursor-pointer rounded-xl border p-4 focus-within:ring-2 focus-within:ring-ring ${source === key ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><input type="radio" name="source-choice" value={key} checked={source === key} onChange={() => setSource(key)} className="sr-only" /><div className="flex items-start justify-between gap-2 text-sm font-semibold">{title}{source === key && <Check className="size-4 shrink-0 text-primary" />}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></label>)}</div>
            {source !== "manual" && <p className="rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Weather comes from <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">Open-Meteo</a>. Hourly weather is matched to each prediction slot using the same backward alignment as training. Recent historical data may not yet be available.</p>}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Choose your window</CardTitle><CardDescription>06:00–19:00 inclusive, in Sri Lankan time.</CardDescription></CardHeader><CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="model">Prediction model</Label><NativeSelect id="model" value={model} onChange={(event) => changeModel(event.target.value as Model)} className="w-full [&_select]:h-11 [&_select]:rounded-xl">{(Object.keys(MODELS) as Model[]).map((key) => <NativeSelectOption key={key} value={key}>{MODELS[key].label}</NativeSelectOption>)}</NativeSelect></div><div className="space-y-2"><Label htmlFor="period">Prediction window</Label><NativeSelect id="period" value={period} onChange={(event) => setPeriod(event.target.value as Submission["period"])} className="w-full [&_select]:h-11 [&_select]:rounded-xl"><NativeSelectOption value="single">Single moment</NativeSelectOption><NativeSelectOption value="range">Date / time range</NativeSelectOption></NativeSelect></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="start-date">{period === "single" ? "Date" : "Start date"}</Label><Input id="start-date" type="date" value={startDate} required min={minDate} max={maxDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-xl" /></div>{selectTime("start-time", period === "single" ? "Time" : "Daily start time", startTime, setStartTime)}</div>
            {period === "range" && <><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="end-date">End date</Label><Input id="end-date" type="date" value={endDate} required min={startDate > (minDate ?? "") ? startDate : minDate} max={maxDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-xl" /></div>{selectTime("end-time", "Daily end time", endTime, setEndTime)}</div><p className="text-xs leading-5 text-muted-foreground">The same time window is included on every selected date. For a time range, keep both dates the same. For a full day, choose 06:00–19:00.</p></>}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3 text-xs"><span>{times.length ? `${times.length} prediction ${times.length === 1 ? "slot" : "slots"}` : "Check your range"}</span><span className="text-muted-foreground">Every {model} minutes · max 1,000 slots</span></div>
            {scheduleError && <p role="alert" className="text-xs text-destructive">{scheduleError}</p>}
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Your installation</CardTitle><CardDescription>One location and capacity for this prediction window.</CardDescription></CardHeader><CardContent>{fields("site")}</CardContent></Card>

          {source === "manual" && <Card><CardHeader><CardTitle>Weather conditions</CardTitle><CardDescription>{rangeManual ? "Enter conditions independently for each selected slot." : "Use weather values for the selected moment. Initial values are examples."}</CardDescription></CardHeader><CardContent className="space-y-6">
            {rangeManual && <div className="space-y-3 rounded-xl border bg-muted/30 p-4"><div className="flex items-center justify-between gap-2"><Label htmlFor="weather-slot">Editing time slot</Label><span className="text-xs text-muted-foreground">{completed} / {times.length} filled</span></div><NativeSelect id="weather-slot" value={slot} onChange={(event) => setSelectedSlot(event.target.value)} className="w-full [&_select]:rounded-xl">{times.map((time) => <NativeSelectOption key={time} value={time}>{stampLabel(time)}</NativeSelectOption>)}</NativeSelect><p className="text-xs leading-5 text-muted-foreground">Each slot starts empty. Weather is not copied to other times automatically.</p><Button type="button" variant="outline" size="sm" disabled={!slot} onClick={() => setManualRows((previous) => ({ ...previous, [slot]: { ...EXAMPLE } }))}><Plus className="size-3" /> Fill this slot with example values</Button></div>}
            {fields("weather")}
            <div className="space-y-4 border-t pt-5"><h3 className="text-xs font-semibold">Solar irradiance</h3>{fields("irradiance")}</div>
            <div className="space-y-4 border-t pt-5"><h3 className="text-xs font-semibold">Cloud cover</h3>{fields("clouds", "sm:grid-cols-2")}</div>
            <div className="space-y-4 border-t pt-5"><h3 className="text-xs font-semibold">Preceding-hour precipitation</h3>{fields("rain", "sm:grid-cols-2")}</div>
            <p className="text-xs leading-5 text-muted-foreground">Sun position and cyclical time features are calculated by the backend for each timestamp.</p>
          </CardContent></Card>}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5"><Card className="border border-primary/15"><CardHeader className="border-b bg-primary/5 pb-5"><CardTitle className="flex items-center gap-2"><Zap className="size-4 text-primary" /> Ready when you are</CardTitle><CardDescription>{model}-minute model · {source === "manual" ? "Manual weather" : `Open-Meteo ${source}`}</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="flex justify-center py-3" aria-hidden="true"><Sun className="size-14 text-primary/60" strokeWidth={1} /></div>
          <dl className="space-y-3 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Prediction slots</dt><dd className="font-medium">{times.length}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Capacity</dt><dd>{values.pv_capacity_kwp || "—"} kWp</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Time zone</dt><dd>Asia/Colombo</dd></div>{rangeManual && <div className="flex justify-between"><dt className="text-muted-foreground">Weather rows filled</dt><dd>{completed} / {times.length}</dd></div>}</dl>
          <p className="text-xs leading-5 text-muted-foreground">Results show power at each selected time, with a table and CSV export. Power in kW is not an energy total in kWh.</p>
          {current && state.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive">{state.error}</p>}
          <Button
            type="submit"
            disabled={pending || !times.length}
            className="h-12 w-full gap-3 rounded-xl text-primary-foreground"
          >
            {pending ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin" />
            ) : (
              <Zap className="size-4 shrink-0" />
            )}

            <span className="flex-1 text-center">
              {pending
                ? source === "manual"
                  ? "Predicting…"
                  : "Fetching weather & predicting…"
                : "Predict solar power"}
            </span>

            <ArrowRight
              className={`size-4 shrink-0 ${pending ? "invisible" : ""}`}
            />
          </Button>
          {state.predictions && !current && <p className="text-xs text-muted-foreground">Inputs changed. Run again to update the results.</p>}
        </CardContent></Card></aside>
      </fieldset>
    </form>
    <div aria-live="polite" aria-busy={pending}>{predictions && <Results key={state.requestKey} rows={predictions} model={model} source={source} />}</div>
  </main>;
}

function Results({ rows, model, source }: { rows: Prediction[]; model: Model; source: string }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(rows.length / 20);
  const peak = rows.reduce((best, row) => row.predicted_power_kw > best.predicted_power_kw ? row : best, rows[0]);
  const average = rows.reduce((sum, row) => sum + row.predicted_power_kw, 0) / rows.length;
  function download() {
    const names: (keyof Prediction)[] = ["timestamp", "predicted_power_kw", "predicted_W", "predicted_W_per_kWp", "pv_capacity_kwp"];
    const csv = [names.join(","), ...rows.map((row) => names.map((name) => row[name]).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `solar-${model}min-${rows[0].timestamp.slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="space-y-5" aria-label="Prediction results"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-tight">Your solar outlook</h2><p className="mt-1 text-xs text-muted-foreground">{rows.length} results · {model}-minute model · {source} weather · Sri Lankan time</p></div><Button type="button" variant="outline" onClick={download}><Download className="size-4" /> Export CSV</Button></div>
    <div className="grid gap-4 sm:grid-cols-3">{[[rows.length === 1 ? "Predicted power" : "Peak predicted power", `${fmt(peak.predicted_power_kw)} kW`, stampLabel(peak.timestamp)], ["Mean sampled power", `${fmt(average)} kW`, "Arithmetic mean across selected slots"], ["Installed capacity", `${fmt(rows[0].pv_capacity_kwp)} kWp`, "Nameplate capacity of the installation"]].map(([label, value, description]) => <Card key={label}><CardContent><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-2 text-xs text-muted-foreground">{description}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Prediction timeline</CardTitle><CardDescription>One row per selected timestamp. All values come from the selected model.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr>{["Date & time (+05:30)", "Power (kW)", "Power (W)", "Normalized (W/kWp)"].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{rows.slice(page * 20, page * 20 + 20).map((row) => <tr key={row.timestamp} className="border-b last:border-0 hover:bg-muted/30"><td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{stampLabel(row.timestamp)}</td><td className="px-3 py-3 font-medium tabular-nums">{fmt(row.predicted_power_kw)}</td><td className="px-3 py-3 tabular-nums">{fmt(row.predicted_W, 1)}</td><td className="px-3 py-3 tabular-nums">{fmt(row.predicted_W_per_kWp, 1)}</td></tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>Page {page + 1} of {pages}</span><div className="flex gap-2"><Button type="button" variant="outline" size="icon-sm" aria-label="Previous results page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><Button type="button" variant="outline" size="icon-sm" aria-label="Next results page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div></div></CardContent></Card>
  </section>;
}
