"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HourStrip } from "../_components/charts";
import { Button, Card, Field, Heading, inputCls, Notice } from "../_components/ui";
import { CONDITION_LABEL, hh } from "../_lib/format";
import { useEnergy } from "../_lib/store";
import type { Condition, OutageEvt, WeatherEvt } from "../_lib/types";

const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);

function Num({ value, onChange, options, suffix }: { value: number; onChange: (v: number) => void; options: number[]; suffix: string }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((o) => <option key={o} value={o}>{o} {suffix}</option>)}
    </select>
  );
}

export default function ConditionsPage() {
  const { settings, update, applyClock, weather, setWeather, outages, setOutages, runPlan, loading, error, loadDemo, clearConditions } = useEnergy();
  const router = useRouter();
  const [remaining, setRemaining] = useState(2);

  const strip = (n: number) => {
    const out = new Array<number>(24).fill(0);
    outages.forEach((o) => { for (let t = o.startIn; t < Math.min(24, o.startIn + o.duration); t++) out[t] = 1; });
    const wx = new Array<Condition | null>(24).fill(null);
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
        <Heading title="Weather outlook" hint="For example: heavy rain for the next 3 hours. Solar output is lowered for those hours." />
        {weather.length === 0 && <p className="mb-3 text-sm text-muted-foreground">None added. The planner uses an average day for this month.</p>}
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
        <Heading title="What the planner will see" />
        <HourStrip hours={hours} outage={out} weather={wx} />
      </Card>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end">
        <Button onClick={() => void go()} disabled={loading}>{loading ? "Planning..." : "Update plan"}</Button>
      </div>
    </>
  );
}
