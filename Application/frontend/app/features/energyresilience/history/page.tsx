"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Heading, Notice, Stat } from "../_components/ui";
import { getEvaluation } from "../_lib/api";
import { PROFILE_INFO } from "../_lib/format";
import { useEnergy } from "../_lib/store";
import type { Evaluation } from "../_lib/types";

export default function HistoryPage() {
  const { log, clearLog, settings } = useEnergy();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getEvaluation().then(setEv).catch((e: Error) => setErr(e.message)); }, []);

  const pick = (c: string) => ev?.controllers.find((r) => r.household === "small" && r.scenario === "moderate" && r.controller === c && String(r.outages_known_in_advance) === "True");
  const rule = pick("rule_based");
  const mine = pick(`mpc_${settings.profile}`);
  const drop = rule && mine && rule.hours_lost_critical_per_year > 0 ? Math.round((1 - mine.hours_lost_critical_per_year / rule.hours_lost_critical_per_year) * 100) : null;

  return (
    <>
      <div>
        <h2 className="text-2xl font-semibold">History and impact</h2>
        <p className="text-sm text-muted-foreground">Your plans from this browser, and what the planner achieves over a simulated year.</p>
      </div>

      <Card>
        <Heading title="Impact over one simulated year" hint="Small home, moderate outage year (about 3 h of cuts a day). Based on your chosen preference." />
        {err && <Notice tone="bad">{err}</Notice>}
        {ev && rule && mine && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Hours of critical power lost" value={`${Math.round(mine.hours_lost_critical_per_year)}`} sub={`normal rule: ${Math.round(rule.hours_lost_critical_per_year)}`} tone={mine.hours_lost_critical_per_year < 1 ? "good" : "warn"} />
            <Stat label="Reduction in lost hours" value={drop === null ? "n/a" : `${drop}%`} sub="against a normal rule" tone="good" />
            <Stat label="Critical energy lost" value={`${mine.unserved_kwh_per_year.toFixed(1)} kWh`} sub={`normal rule: ${rule.unserved_kwh_per_year.toFixed(1)} kWh`} />
            <Stat label="Preference" value={PROFILE_INFO[settings.profile].title} sub="change it on Setup" />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Simulated, not measured from a real home. See Compare for the full table.</p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Heading title="Plans you made" hint="Saved in this browser only." />
          {log.length > 0 && <Button variant="outline" onClick={clearLog}>Clear</Button>}
        </div>
        {log.length === 0 ? (
          <Notice tone="info">No plans yet. Make one on the <Link href="/features/energyresilience/plan" className="underline">plan page</Link>.</Notice>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-3 font-medium">When</th><th className="pr-3 font-medium">Preference</th><th className="pr-3 font-medium">Power cut</th><th className="pr-3 font-medium">Planner lost</th><th className="font-medium">Normal rule lost</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.time} className="border-t border-border">
                    <td className="py-2 pr-3">{new Date(l.time).toLocaleString()}</td>
                    <td className="pr-3">{PROFILE_INFO[l.profile].title}</td>
                    <td className="pr-3">{l.outageHours > 0 ? `${l.outageHours} h` : "none"}</td>
                    <td className="pr-3"><Badge tone={l.unservedKwh > 0.01 ? "bad" : "good"}>{l.unservedKwh.toFixed(2)} kWh</Badge></td>
                    <td><Badge tone={l.ruleUnservedKwh > 0.01 ? "bad" : "default"}>{l.ruleUnservedKwh.toFixed(2)} kWh</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
