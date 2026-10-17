"use client";

import { useActionState, useState } from "react";
import { ArrowDownRight, ArrowRight, Check, ChevronDown, Clock3, CloudSun, Compass, Droplets, LoaderCircle, MapPin, RotateCcw, Sparkles, Sun, Sunrise, Sunset, Wind, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { predictSolar } from "./actions";
import { FIELDS, MODELS, requestKey, timeLabel, timeOptions, type Model, type PredictionState, type Values } from "./config";

const INITIAL_VALUES = Object.fromEntries(FIELDS.map((field) => [field.name, field.value])) as Values;
const number = (value: number, digits = 2) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);

export function SolarPredictionForm({ initialDate }: { initialDate: string }) {
  const [model, setModel] = useState<Model>("15");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("08:15");
  const [values, setValues] = useState<Values>({ ...INITIAL_VALUES });
  const [state, action, pending] = useActionState<PredictionState, FormData>(predictSolar, {});
  const currentKey = requestKey(model, date, time, values);
  const current = state.requestKey === currentKey;
  const prediction = current && !pending ? state.prediction : undefined;
  const error = current ? state.error : undefined;

  function changeModel(next: Model) {
    setModel(next);
    const [hours, minutes] = time.split(":").map(Number);
    const snapped = Math.min(19 * 60, Math.max(6 * 60, Math.ceil((hours * 60 + minutes) / MODELS[next].interval) * MODELS[next].interval));
    setTime(timeLabel(snapped));
  }

  function reset() {
    setValues({ ...INITIAL_VALUES });
    setDate(initialDate);
    setTime("08:15");
    setModel("15");
  }

  function fields(group: string, columns = "sm:grid-cols-3") {
    return <div className={`grid gap-x-4 gap-y-5 ${columns}`}>
      {FIELDS.filter((field) => field.group === group).map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className="text-xs font-medium text-muted-foreground">{field.label}</Label>
          <div className="relative">
            <Input id={field.name} name={field.name} type="number" step="any" required min={field.min} max={field.max}
              value={values[field.name]} onChange={(event) => setValues((previous) => ({ ...previous, [field.name]: event.target.value }))}
              className="h-11 rounded-xl bg-background pr-16 tabular-nums" />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{field.unit}</span>
          </div>
        </div>
      ))}
    </div>;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-1 py-4 text-foreground sm:px-4 sm:py-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="h-px w-7 bg-primary" /> SMART SCHEDULING <span className="text-border">/</span> SOLAR LAB</div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">A clearer view of your solar.</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">Turn weather and site conditions into a solar power estimate. Choose a moment, set the scene, and explore your output.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs text-muted-foreground"><MapPin className="size-3.5 text-primary" /> Sri Lanka <span className="mx-1 h-3 border-l" /> UTC +05:30</div>
      </header>

      <form action={action}>
        <fieldset disabled={pending} className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
          <legend className="sr-only">Solar prediction inputs</legend>
          <div className="min-w-0 space-y-5">
            <Card className="gap-5 border-0 shadow-none">
              <CardHeader><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock3 className="size-4" /></span><div><CardTitle>Choose your moment</CardTitle><CardDescription className="mt-1 text-xs">Select a model and a local prediction time.</CardDescription></div></div></CardHeader>
              <CardContent className="space-y-6">
                <div role="radiogroup" aria-label="Prediction model" className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(MODELS) as Model[]).map((key) => (
                    <label key={key} className={`relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring ${model === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                      <input type="radio" name="model" value={key} checked={model === key} onChange={() => changeModel(key)} className="sr-only" />
                      <div><div className="flex items-center gap-2 text-sm font-semibold">{MODELS[key].label}{key === "15" && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">STANDARD</span>}</div><p className="mt-1 text-xs text-muted-foreground">{key === "5" ? "Finer time selection" : "Quarter-hour time selection"}</p></div>
                      <span className={`flex size-5 items-center justify-center rounded-full border ${model === key ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{model === key && <Check className="size-3" />}</span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="date">Prediction date</Label><Input id="date" name="date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="h-11 rounded-xl bg-background" /></div>
                  <div className="space-y-2"><Label htmlFor="time">Time in Sri Lanka</Label><NativeSelect id="time" name="time" value={time} onChange={(event) => setTime(event.target.value)} className="w-full [&_select]:h-11 [&_select]:rounded-xl [&_select]:bg-background">{timeOptions(model).map((option) => <NativeSelectOption key={option} value={option}>{option}</NativeSelectOption>)}</NativeSelect></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2"><Sunrise className="size-4 text-primary" /> 06:00 <span className="mx-1 h-px w-8 bg-border" /> <Sunset className="size-4 text-primary" /> 19:00</span><span>{model}-minute steps · both limits included</span>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-5 shadow-none"><CardHeader><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Compass className="size-4" /></span><div><CardTitle>Your installation</CardTitle><CardDescription className="mt-1 text-xs">Location and nameplate capacity of your solar system.</CardDescription></div></div></CardHeader><CardContent>{fields("site")}</CardContent></Card>

            <Card className="gap-5 shadow-none">
              <CardHeader><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><CloudSun className="size-4" /></span><div><CardTitle>Set the weather</CardTitle><CardDescription className="mt-1 text-xs">Use observed or forecast conditions for your selected moment.</CardDescription></div></div></CardHeader>
              <CardContent className="space-y-6">
                {fields("weather")}
                <div className="space-y-4 border-t pt-5"><h3 className="flex items-center gap-2 text-xs font-semibold"><Sun className="size-3.5 text-primary" /> Solar irradiance</h3>{fields("irradiance")}</div>
                <details className="group rounded-xl border bg-muted/20" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>Cloud cover & precipitation</span><ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
                  <div className="space-y-5 border-t p-4">{fields("clouds", "sm:grid-cols-2")}<div className="space-y-4 border-t pt-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Droplets className="size-3.5" /> Totals over the preceding hour</p>{fields("rain", "sm:grid-cols-2")}</div></div>
                </details>
                <p className="flex gap-2 text-xs leading-5 text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" /> Sun position and cyclical time features are calculated by the backend from your date, time, and coordinates.</p>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <Card className="gap-0 overflow-hidden border border-primary/15 shadow-none">
              <CardHeader className="border-b bg-primary/5 pb-5"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Zap className="size-4 text-primary" /> Prediction</CardTitle><span className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">{model} MIN MODEL</span></div><CardDescription className="text-xs">One moment. Your estimated solar output.</CardDescription></CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div aria-live="polite" aria-atomic="true" aria-busy={pending}>
                  {pending ? <div className="flex min-h-52 flex-col items-center justify-center gap-4 text-center"><LoaderCircle className="size-9 animate-spin text-primary motion-reduce:animate-none" /><div><p className="text-sm font-medium">Calculating your output</p><p className="mt-1 text-xs text-muted-foreground">Using your selected model and conditions.</p></div></div> : prediction ? <div className="space-y-5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" /> Prediction complete</div>
                    <div><p className="text-xs text-muted-foreground">Estimated generation power</p><p className="mt-2 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight tabular-nums">{number(prediction.predicted_power_kw, 3)}</span><span className="text-lg text-muted-foreground">kW</span></p></div>
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] text-muted-foreground">Normalized power</p><p className="mt-1 font-semibold tabular-nums">{number(prediction.predicted_W_per_kWp)} <span className="text-[10px] font-normal text-muted-foreground">W/kWp</span></p></div><div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] text-muted-foreground">Power in watts</p><p className="mt-1 font-semibold tabular-nums">{number(prediction.predicted_W)} <span className="text-[10px] font-normal text-muted-foreground">W</span></p></div></div>
                    <div className="flex items-center justify-between border-t pt-4 text-xs"><span className="text-muted-foreground">Installed capacity</span><span className="font-medium">{number(prediction.pv_capacity_kwp)} kWp</span></div>
                    <p className="text-xs leading-5 text-muted-foreground">This is a power estimate at the selected time. It is not an energy total in kWh.</p>
                  </div> : <div className="flex min-h-52 flex-col items-center justify-center text-center">
                    <div className="relative mb-5 flex h-24 w-44 items-end justify-center overflow-hidden" aria-hidden="true"><div className="absolute bottom-0 h-20 w-40 rounded-t-full border border-dashed border-primary/25" /><div className="absolute bottom-0 h-14 w-28 rounded-t-full bg-primary/5" /><Sun className="relative mb-2 size-12 text-primary/70" strokeWidth={1} /><div className="absolute inset-x-0 bottom-0 h-px bg-border" /></div>
                    <p className="text-sm font-medium">Your next insight starts here</p><p className="mt-2 max-w-56 text-xs leading-5 text-muted-foreground">Set your conditions, then run a prediction to see your estimated solar power.</p>
                    {state.prediction && !current && <p className="mt-3 text-xs text-primary">Inputs changed. Run again for an updated result.</p>}
                  </div>}
                </div>
                <dl className="space-y-2 rounded-xl border p-3 text-xs"><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{date || "Select a date"}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Local time</dt><dd className="font-medium">{time} · UTC +05:30</dd></div></dl>
                {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive">{error}</div>}
                <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl text-sm">{pending ? <><LoaderCircle className="size-4 animate-spin" /> Calculating…</> : <><Zap className="size-4" /> {prediction ? "Run prediction again" : "Predict solar power"}<ArrowRight className="ml-auto size-4" /></>}</Button>
                <Button type="button" variant="ghost" onClick={reset} disabled={pending} className="w-full text-xs text-muted-foreground"><RotateCcw className="size-3.5" /> Reset to example inputs</Button>
              </CardContent>
            </Card>
            <div className="rounded-2xl bg-secondary/60 p-5 text-secondary-foreground"><div className="flex items-center gap-2 text-xs font-medium"><ArrowDownRight className="size-4" /> A little context</div><p className="mt-2 text-xs leading-6 text-muted-foreground">The form starts with example conditions. Replace them with weather data for your site and time before interpreting the result.</p></div>
            <p className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><Wind className="size-3" /> Weather in. Solar insight out.</p>
          </aside>
        </fieldset>
      </form>
    </main>
  );
}
