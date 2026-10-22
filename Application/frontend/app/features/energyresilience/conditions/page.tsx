"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HourStrip } from "../_components/charts";
import { Button, Card, Field, Heading, inputCls, Notice } from "../_components/ui";
import { getForecast } from "../_lib/api";
import { CONDITION_LABEL, hh, MONTHS } from "../_lib/format";
import { useEnergy } from "../_lib/store";
import type { Condition, Forecast, OutageEvt, WeatherEvt } from "../_lib/types";

const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);

function Num({ value, onChange, options, suffix }: { value: number; onChange: (v: number) => void; options: number[]; suffix: string }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((o) => <option key={o} value={o}>{o} {suffix}</option>)}
    </select>
  );
}

export default function ConditionsPage() {
  const { settings, update, applyClock, hydrated, weather, setWeather, outages, setOutages, runPlan, loading, error, loadDemo, clearConditions } = useEnergy();
  const router = useRouter();
  const [remaining, setRemaining] = useState(2);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [fcBusy, setFcBusy] = useState(false);
  const [fcError, setFcError] = useState<string | null>(null);

  const loadForecast = async () => {
    setFcBusy(true);
    setFcError(null);
    try {
      setFc(await getForecast(settings.lat, settings.lon, settings.startHour));
      update({ useForecast: true });
    } catch (e) {
      setFc(null);
      update({ useForecast: false });
      setFcError(e instanceof Error ? e.message : "Live forecast unavailable.");
    } finally {
      setFcBusy(false);
    }
  };

  // When live forecast is switched on (also after a reload), keep the preview in step with the place and hour.
  useEffect(() => {
    if (!hydrated || !settings.useForecast) { setFc(null); return; }
    let live = true;
    setFcBusy(true);
    getForecast(settings.lat, settings.lon, settings.startHour)
      .then((f) => { if (live) { setFc(f); setFcError(null); } })
      .catch((e) => { if (live) { setFc(null); setFcError(e instanceof Error ? e.message : "Live forecast unavailable."); } })
      .finally(() => { if (live) setFcBusy(false); });
    return () => { live = false; };
  }, [hydrated, settings.useForecast, settings.lat, settings.lon, settings.startHour]);

  const strip = (n: number) => {
    const out = new Array<number>(24).fill(0);
    outages.forEach((o) => { for (let t = o.startIn; t < Math.min(24, o.startIn + o.duration); t++) out[t] = 1; });
    const wx = new Array<Condition | null>(24).fill(null);
    if (settings.useForecast && fc) fc.hours.forEach((h, t) => { wx[t] = h.ghi_wm2 < 5 && h.label === "sunny" ? null : h.label; });   // night is not coloured
    weather.forEach((w) => { for (let t = w.startIn; t < Math.min(24, w.startIn + w.duration); t++) wx[t] = w.condition; });
    return { out: out.slice(0, n), wx: wx.slice(0, n) };
  };
  const { out, wx } = strip(24);
  const hours = range(24).map((t) => (settings.startHour + t) % 24);

  const setO = (i: number, patch: Partial<OutageEvt>) => setOutages(outages.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const setW = (i: number, patch: Partial<WeatherEvt>) => setWeather(weather.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  const cutNow = () => setOutages([{ startIn: 0, duration: remaining }, ...outages.filter((o) => o.startIn !== 0)]);

  const go = async () => {
    const r = await runPlan();
    if (r) router.push("/features/energyresilience/plan");
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Conditions</h2>
          <p className="text-sm text-muted-foreground">You often know more than any forecast. Tell the planner and it re-plans straight away.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDemo}>Load demo case</Button>
          <Button variant="outline" onClick={clearConditions}>Clear all</Button>
        </div>
      </div>

      <Card>
        <Heading title="Time now" hint="The plan starts from this hour." />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56"><Field label="Current hour">
            <select className={inputCls} value={settings.startHour} onChange={(e) => update({ startHour: Number(e.target.value) })}>
              {range(24).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
            </select>
          </Field></div>
          <Button variant="outline" onClick={applyClock}>Use computer clock</Button>
        </div>
      </Card>

      <Card>
        <Heading title="Live weather forecast" hint={`Fetched from Open-Meteo for ${settings.place}. It replaces typing the weather by hand.`} />
        <div className="flex flex-wrap items-center gap-3">
          {!settings.useForecast ? (
            <Button onClick={() => void loadForecast()} disabled={fcBusy}>{fcBusy ? "Fetching..." : "Use live forecast"}</Button>
          ) : (
            <Button variant="outline" onClick={() => update({ useForecast: false })}>Switch to a typical day</Button>
          )}
          <span className="text-sm text-muted-foreground">
            {settings.useForecast
              ? fcBusy ? "Fetching the forecast..." : fc ? `On. Expected solar over 24 hours: ${fc.hours.reduce((a, h) => a + h.pv_kwh_per_kwp, 0).toFixed(1)} kWh for each kWp of panels.` : "On, but the forecast could not be loaded. The planner will use a typical day."
              : `Off. The planner uses an average day for ${MONTHS[settings.month - 1]}.`}
          </span>
        </div>
        {fcError && <div className="mt-3"><Notice tone="warn">{fcError} The planner will use a typical day instead.</Notice></div>}
        {settings.useForecast && fc && (
          <p className="mt-3 text-xs text-muted-foreground">
            {(() => {
              const rainy = fc.hours.filter((h) => h.label === "rainy").length;
              const cloudy = fc.hours.filter((h) => h.label === "cloudy").length;
              const rainText = rainy === 24 ? "Rain expected all day" : rainy === 0 ? "No rain expected in the next 24 hours" : `Rain expected in ${rainy} of the next 24 hours`;
              return `${rainText}${cloudy > 0 ? `, cloud in ${cloudy}` : ""}.`;
            })()}
            You can still add your own weather below. It overrides the forecast for those hours.
          </p>
        )}
      </Card>

      <Card className="border-destructive/40">
        <Heading title="Power just went off?" hint="Enter how long CEB says it will last. The planner switches to outage mode now." />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Field label="CEB says it lasts">
              <Num value={remaining} onChange={setRemaining} options={range(12, 1)} suffix="h" />
            </Field>
          </div>
          <Button variant="danger" onClick={cutNow}>Power is off now</Button>
        </div>
      </Card>

      <Card>
        <Heading title="Planned power cuts" hint="From a CEB message or notice." />
        {outages.length === 0 && <p className="mb-3 text-sm text-muted-foreground">None added. The planner assumes the grid stays on.</p>}
        <div className="space-y-3">
          {outages.map((o, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-44"><Field label="Starts in"><Num value={o.startIn} onChange={(v) => setO(i, { startIn: v })} options={range(24)} suffix="h" /></Field></div>
              <div className="w-44"><Field label="Lasts"><Num value={o.duration} onChange={(v) => setO(i, { duration: v })} options={range(12, 1)} suffix="h" /></Field></div>
              <Button variant="outline" onClick={() => setOutages(outages.filter((_, k) => k !== i))}>Remove</Button>
            </div>
          ))}
        </div>
        <div className="mt-4"><Button variant="outline" onClick={() => setOutages([...outages, { startIn: 4, duration: 2 }])}>Add a power cut</Button></div>
      </Card>

      <Card>
        <Heading title="Your own weather knowledge (optional)" hint="For example: heavy rain for the next 3 hours. Solar output is lowered for those hours and this overrides the forecast." />
        {weather.length === 0 && <p className="mb-3 text-sm text-muted-foreground">None added. The planner uses the live forecast if it is on, otherwise an average day for this month.</p>}
        <div className="space-y-3">
          {weather.map((w, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Field label="Weather">
                  <select className={inputCls} value={w.condition} onChange={(e) => setW(i, { condition: e.target.value as Condition })}>
                    {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                  </select>
                </Field>
              </div>
              <div className="w-40"><Field label="Starts in"><Num value={w.startIn} onChange={(v) => setW(i, { startIn: v })} options={range(24)} suffix="h" /></Field></div>
              <div className="w-40"><Field label="Lasts"><Num value={w.duration} onChange={(v) => setW(i, { duration: v })} options={range(12, 1)} suffix="h" /></Field></div>
              <Button variant="outline" onClick={() => setWeather(weather.filter((_, k) => k !== i))}>Remove</Button>
            </div>
          ))}
        </div>
        <div className="mt-4"><Button variant="outline" onClick={() => setWeather([...weather, { startIn: 0, duration: 3, condition: "rainy" }])}>Add weather</Button></div>
      </Card>

      <Card>
        <Heading title="What the planner will see" hint="Top row: weather from the forecast and your own entries. Bottom row: power cuts." />
        <HourStrip hours={hours} outage={out} weather={wx} />
      </Card>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end">
        <Button onClick={() => void go()} disabled={loading}>{loading ? "Planning..." : "Update plan"}</Button>
      </div>
    </>
  );
}
