"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Heading, Notice, inputCls } from "./_components/ui";
import { MONTHS, PLACES, PROFILE_INFO } from "./_lib/format";
import { useEnergy } from "./_lib/store";
import type { Profile } from "./_lib/types";

const PROFILES: Profile[] = ["savings", "balanced", "resilience"];
const TONE: Record<Profile, string> = {
  savings: "from-emerald-500/15",
  balanced: "from-sky-500/15",
  resilience: "from-primary/30",
};

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <input
      type="number"
      className={inputCls}
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
    />
  );
}

export default function SetupPage() {
  const { settings: s, update, loadDemo } = useEnergy();
  const router = useRouter();
  const [demoOn, setDemoOn] = useState(false);
  const bad = [s.buy, s.sell, s.batteryKwh, s.pvKwp, s.dailyKwh, s.socPct].some((v) => !Number.isFinite(v)) || s.sell > s.buy;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">System setup</h2>
          <p className="text-sm text-muted-foreground">Tell us what you own and what you care about. We handle the forecasting and planning.</p>
        </div>
        <Button variant="outline" onClick={() => { loadDemo(); setDemoOn(true); }}>Load demo case</Button>
      </div>

      {demoOn && (
        <Notice tone="good">
          Demo case loaded: battery at 25%, 3 pm, rain for 3 hours and a power cut in 4 hours that lasts 5 hours. Scroll down and press Save and continue.
        </Notice>
      )}

      <Card>
        <Heading n={1} title="Electricity prices" hint="Used to decide when storing or exporting energy is worth it." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buying price (LKR per unit)" hint="What you pay the grid for each kWh.">
            <NumberInput value={s.buy} min={1} max={200} step={0.5} onChange={(v) => update({ buy: v })} />
          </Field>
          <Field label="Selling price (LKR per unit)" hint="What you earn for each kWh you export.">
            <NumberInput value={s.sell} min={0} max={200} step={0.5} onChange={(v) => update({ sell: v })} />
          </Field>
        </div>
        {s.sell > s.buy && <p className="mt-3 text-sm text-destructive">The selling price should not be higher than the buying price.</p>}
      </Card>

      <Card>
        <Heading n={2} title="Your battery and solar panels" hint="The size decides how long you can last without the grid." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={`Battery size: ${s.batteryKwh} kWh`} hint="Usable storage. Typical homes have 5 to 10 kWh.">
            <input type="range" min={1} max={15} step={0.5} value={Number.isFinite(s.batteryKwh) ? s.batteryKwh : 5} onChange={(e) => update({ batteryKwh: Number(e.target.value) })} className="w-full accent-[var(--chart-2)]" />
          </Field>
          <Field label="Solar panel size (kWp)" hint="Total panel capacity, for example 3.1 or 6.3.">
            <NumberInput value={s.pvKwp} min={0.5} max={30} step={0.1} onChange={(v) => update({ pvKwp: v })} />
          </Field>
          <Field label="Home electricity use per day (kWh)" hint="Check a monthly bill and divide by 30.">
            <NumberInput value={s.dailyKwh} min={1} max={80} step={0.5} onChange={(v) => update({ dailyKwh: v })} />
          </Field>
          <Field label="Battery level now (%)" hint="Read it from your inverter app.">
            <NumberInput value={s.socPct} min={0} max={100} step={1} onChange={(v) => update({ socPct: v })} />
          </Field>
          <Field label="Where is your home?" hint="Used to fetch the live weather forecast for your area.">
            <select className={inputCls} value={s.place} onChange={(e) => update({ place: e.target.value, ...PLACES[e.target.value] })}>
              {Object.keys(PLACES).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <Heading n={3} title="What matters more to you?" hint="This sets how much battery we keep in reserve for a power cut." />
        <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Preference">
          {PROFILES.map((p) => {
            const on = s.profile === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update({ profile: p })}
                className={`rounded-xl border-2 bg-gradient-to-br ${TONE[p]} to-transparent p-4 text-left transition ${on ? "border-chart-2" : "border-border hover:border-muted-foreground"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{PROFILE_INFO[p].title}</span>
                  <span className={`size-4 rounded-full border-2 ${on ? "border-chart-2 bg-chart-2" : "border-muted-foreground"}`} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{PROFILE_INFO[p].text}</p>
                <p className="mt-3 text-xs font-medium">Keeps about {PROFILE_INFO[p].reserve}% in reserve</p>
              </button>
            );
          })}
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">The plan starts at {String(s.startHour).padStart(2, "0")}:00 in {MONTHS[s.month - 1]}. You can change the hour on the Conditions page.</p>

      <div className="flex justify-end">
        <Button disabled={bad} onClick={() => router.push("/features/energyresilience/conditions")}>Save and continue</Button>
      </div>
    </>
  );
}
