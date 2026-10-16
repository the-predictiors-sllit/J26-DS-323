"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BarChart, LineChart, ScatterChart } from "../_components/charts";
import { Badge, Button, Card, Field, Heading, inputCls, Notice } from "../_components/ui";
import { getEvaluation } from "../_lib/api";
import { lkr } from "../_lib/format";
import { useEnergy } from "../_lib/store";
import type { Evaluation, EvalRow } from "../_lib/types";

const known = (r: EvalRow) => r.outages_known_in_advance === true || String(r.outages_known_in_advance) === "True";
const SCEN = ["mild", "moderate", "severe"] as const;
const SCEN_TEXT = { mild: "Mild (about 1.5 h a day)", moderate: "Moderate (about 3 h a day)", severe: "Severe (about 5 h a day)" };

export default function ComparePage() {
  const { result, runPlan, loading, error, hydrated } = useEnergy();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [evErr, setEvErr] = useState<string | null>(null);
  const [home, setHome] = useState<"small" | "large">("small");
  const [scen, setScen] = useState<(typeof SCEN)[number]>("moderate");

  const started = useRef(false);
  useEffect(() => {
    if (hydrated && !started.current && !result) {
      started.current = true;
      void runPlan();
    }
  }, [hydrated, result, runPlan]);

  useEffect(() => {
    getEvaluation().then(setEv).catch((e: Error) => setEvErr(e.message));
  }, []);

  const rows = ev?.controllers.filter((r) => r.household === home && r.scenario === scen && known(r)) ?? [];
  const get = (c: string) => rows.find((r) => r.controller === c);
  const reserves = ev?.reserve_rules.filter((r) => r.household === home && r.scenario === scen) ?? [];

  return (
    <>
      <div>
        <h2 className="text-2xl font-semibold">Compare</h2>
        <p className="text-sm text-muted-foreground">The same home and the same power cuts, run with our planner and with ordinary battery rules.</p>
      </div>

      <Card>
        <Heading title="Your plan, this day" hint="All three use the same solar, home use, power cut and battery." />
        {!result ? (
          <div className="space-y-3">
            <Notice tone="info">Make a plan first to see this comparison.</Notice>
            <Button onClick={() => void runPlan()} disabled={loading}>{loading ? "Planning..." : "Make a plan"}</Button>
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {([result.comparison.plain_rule, result.comparison.reserve_rule, result.comparison.mpc]).map((c, i) => (
                <div key={c.label} className={`rounded-xl border p-4 ${i === 2 ? "border-chart-2 bg-primary/10" : "border-border"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{c.label}</p>
                    {i === 2 && <Badge tone="warn">Ours</Badge>}
                  </div>
                  <p className={`mt-3 text-3xl font-bold ${c.unserved_critical_kwh > 0.01 ? "text-destructive" : "text-emerald-400"}`}>{c.unserved_critical_kwh.toFixed(2)} kWh</p>
                  <p className="text-sm text-muted-foreground">critical power lost</p>
                  <p className="mt-2 text-sm">{c.hours_lost} hour{c.hours_lost === 1 ? "" : "s"} in the dark</p>
                  <p className="text-sm">Grid cost {lkr(c.grid_cost_lkr)}</p>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <BarChart
                label="Critical power lost by method"
                unit="kWh lost"
                bars={[
                  { label: "Normal rule", value: result.comparison.plain_rule.unserved_critical_kwh, color: "var(--destructive)" },
                  { label: "Reserve rule", value: result.comparison.reserve_rule.unserved_critical_kwh, color: "var(--chart-3)" },
                  { label: "Our planner", value: result.comparison.mpc.unserved_critical_kwh, color: "var(--chart-1)" },
                ]}
              />
            </div>
            <div className="mt-4">
              <LineChart
                label="Battery level by method"
                hours={result.hour_of_day}
                outage={result.outage_forecast}
                unit="battery %"
                yMax={100}
                series={[
                  { name: "Normal rule", values: result.comparison.plain_rule.soc_pct, color: "var(--destructive)" },
                  { name: "Reserve rule", values: result.comparison.reserve_rule.soc_pct, color: "var(--chart-4)", dashed: true },
                  { name: "Our planner", values: result.comparison.mpc.soc_pct, color: "var(--chart-1)" },
                ]}
              />
              <p className="mt-2 text-sm text-muted-foreground">The planner holds charge before the power cut. A normal rule spends it on the evening load and runs low.</p>
            </div>
          </>
        )}
      </Card>

      <Card>
        <Heading title="One simulated year" hint="Three kinds of outage years and two home sizes. These are simulated, not real measurements." />
        <div className="mb-4 grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Home"><select className={inputCls} value={home} onChange={(e) => setHome(e.target.value as "small" | "large")}><option value="small">Small (about 9 kWh a day, 3.1 kWp)</option><option value="large">Large (about 28 kWh a day, 6.3 kWp)</option></select></Field>
          <Field label="Outage level"><select className={inputCls} value={scen} onChange={(e) => setScen(e.target.value as (typeof SCEN)[number])}>{SCEN.map((s) => <option key={s} value={s}>{SCEN_TEXT[s]}</option>)}</select></Field>
        </div>
        {evErr && <Notice tone="bad">{evErr}</Notice>}
        {ev && rows.length > 0 && (
          <>
            <BarChart
              label="Hours of critical power lost in a year"
              unit="hours lost per year"
              decimals={0}
              bars={[
                { label: "Normal rule", value: get("rule_based")?.hours_lost_critical_per_year ?? 0, color: "var(--destructive)" },
                { label: "Savings", value: get("mpc_savings")?.hours_lost_critical_per_year ?? 0, color: "var(--chart-3)" },
                { label: "Balanced", value: get("mpc_balanced")?.hours_lost_critical_per_year ?? 0, color: "var(--chart-2)" },
                { label: "Resilience", value: get("mpc_resilience")?.hours_lost_critical_per_year ?? 0, color: "var(--chart-1)" },
              ]}
            />
            <div className="mt-6">
              <h3 className="mb-1 font-medium">Cost against safety</h3>
              <p className="mb-2 text-sm text-muted-foreground">Lower and further left is better. At the same reserve level, the planner costs less and loses no more hours than the fixed-reserve rule. This held in all 18 year-long cases we ran.</p>
              <ScatterChart
                label="Grid cost against hours of power lost"
                xLabel="Grid cost per year (LKR, lower is better)"
                yLabel="hours lost per year"
                dots={[
                  ...reserves.map((r) => ({ label: r.controller.replace("rule_reserve_", "Rule ") + "%", x: r.grid_cost_lkr_per_year, y: r.hours_lost_critical_per_year, color: "var(--destructive)" })),
                  ...["savings", "balanced", "resilience"].flatMap((p) => {
                    const r = get(`mpc_${p}`);
                    return r ? [{ label: `Planner ${p}`, x: r.grid_cost_lkr_per_year, y: r.hours_lost_critical_per_year, color: "var(--chart-1)" }] : [];
                  }),
                ]}
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 font-medium">Method</th><th className="pr-3 font-medium">Hours lost a year</th><th className="pr-3 font-medium">kWh lost a year</th><th className="font-medium">Grid cost a year</th></tr></thead>
                <tbody>
                  {[...reserves.map((r) => ({ name: r.controller.replace("rule_reserve_", "Rule with ") + "% reserve", r })), ...rows.map((r) => ({ name: r.controller === "rule_based" ? "Normal rule" : `Planner, ${r.controller.replace("mpc_", "")}`, r }))].map(({ name, r }) => (
                    <tr key={name} className="border-t border-border"><td className="py-2 pr-3">{name}</td><td className="pr-3">{Math.round(r.hours_lost_critical_per_year)}</td><td className="pr-3">{r.unserved_kwh_per_year.toFixed(1)}</td><td>{lkr(r.grid_cost_lkr_per_year)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Home use comes from real household logs. Solar comes from NASA POWER weather and the pvlib model. Outage patterns are assumed, not measured. Negative cost means you earned more than you paid.</p>
      </Card>

      <div className="flex justify-between text-sm">
        <Link href="/features/energyresilience/plan" className="text-chart-2 underline-offset-4 hover:underline">Back to the plan</Link>
        <Link href="/features/energyresilience/history" className="text-chart-2 underline-offset-4 hover:underline">History</Link>
      </div>
    </>
  );
}
