"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LineChart } from "../_components/charts";
import { Badge, Button, Card, Heading, Notice, Stat } from "../_components/ui";
import { describeAction, hh, PROFILE_INFO, reasonFor } from "../_lib/format";
import { useEnergy } from "../_lib/store";

export default function PlanPage() {
  const { result, runPlan, loading, error, settings, hydrated } = useEnergy();
  const started = useRef(false);
  useEffect(() => {
    if (hydrated && !started.current && !result) {
      started.current = true;
      void runPlan();
    }
  }, [hydrated, result, runPlan]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold">Today&apos;s plan</h2>
        <p className="text-sm text-muted-foreground">What the battery will do over the next 24 hours, and why.</p>
      </div>
      <Button onClick={() => void runPlan()} disabled={loading}>{loading ? "Planning..." : "Update plan"}</Button>
    </div>
  );

  if (error) return <>{header}<Notice tone="bad">{error}</Notice></>;
  if (!result) return <>{header}<Notice tone="info">{loading ? "Working out your plan..." : "No plan yet. Press Update plan."}</Notice></>;

  const { plan, hour_of_day: hours, outage_forecast: out, pv_forecast_kwh: pv, load_forecast_kwh: load } = result;
  const firstOut = out.indexOf(1);
  const now = plan.hours[0];
  const view = describeAction(now.action);
  const cap = result.battery_kwh;
  const reserve = PROFILE_INFO[result.profile].reserve;
  const tone = firstOut === 0 ? "bad" : firstOut > 0 ? "warn" : "good";

  return (
    <>
      {header}

      {firstOut === 0 ? (
        <Notice tone="bad"><strong>Power cut now.</strong> The grid is down for about {out.reduce((a, b) => a + b, 0)} h. Critical loads are on battery and solar.</Notice>
      ) : firstOut > 0 ? (
        <Notice tone="warn"><strong>Power cut expected at {hh(hours[firstOut])}</strong> (in {firstOut} h, for {out.reduce((a, b) => a + b, 0)} h). The planner is getting the battery ready.</Notice>
      ) : (
        <Notice tone="good">No power cut is expected in the next 24 hours. You can add one on the Conditions page.</Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Battery now" value={`${settings.socPct}%`} sub={`${cap} kWh battery`} />
        <Stat label="Solar this hour" value={`${pv[0].toFixed(2)} kWh`} sub={`${result.pv_kwp} kWp panels`} />
        <Stat label="Home use this hour" value={`${load[0].toFixed(2)} kWh`} />
        <Stat
          label="Time to power cut"
          value={firstOut === 0 ? "Now" : firstOut > 0 ? `${firstOut} h` : "None"}
          tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : "good"}
          sub={firstOut >= 0 ? undefined : "in the next 24 h"}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Planner recommendation for this hour</p>
            <p className="text-3xl font-bold tracking-tight">{view.label}</p>
          </div>
          <Badge tone="warn">{PROFILE_INFO[result.profile].title}</Badge>
        </div>
        <p className="mt-2 text-sm">{reasonFor(view, firstOut > 0 ? firstOut : null)}</p>
        {result.notes.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {result.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </Card>

      <Card>
        <Heading title="Solar and home use, next 24 hours" hint="Forecast energy per hour. Red shading is a power cut." />
        <LineChart
          label="Solar forecast and home use per hour"
          hours={hours}
          outage={out}
          unit="kWh per hour"
          series={[
            { name: "Solar forecast", values: pv, color: "var(--chart-2)" },
            { name: "Home use forecast", values: load, color: "var(--chart-5)", dashed: true },
          ]}
        />
      </Card>

      <Card>
        <Heading title="Planned battery level" hint={`The dashed line is the ${reserve}% reserve for your preference.`} />
        <LineChart
          label="Planned battery level in percent"
          hours={hours}
          outage={out}
          unit="battery %"
          yMax={100}
          refLine={{ value: reserve, text: `${reserve}% reserve` }}
          series={[{ name: "Battery level (plan)", values: plan.hours.map((h) => h.soc_pct_end), color: "var(--chart-1)" }]}
        />
      </Card>

      <Card>
        <Heading title="Hour by hour" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2 pr-3 font-medium">Hour</th><th className="pr-3 font-medium">Action</th><th className="pr-3 font-medium">Battery at end</th><th className="pr-3 font-medium">Grid import</th><th className="font-medium">Grid export</th></tr>
            </thead>
            <tbody>
              {plan.hours.map((h, i) => {
                const v = describeAction(h.action);
                return (
                  <tr key={h.hour} className={`border-t border-border ${out[i] ? "bg-destructive/10" : ""}`}>
                    <td className="py-2 pr-3">{hh(hours[i])}</td>
                    <td className="pr-3 font-medium">{v.label}</td>
                    <td className="pr-3">{h.soc_pct_end}%</td>
                    <td className="pr-3">{h.grid_import_kwh.toFixed(2)} kWh</td>
                    <td>{h.grid_export_kwh.toFixed(2)} kWh</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-between">
        <Link href="/features/energyresilience/conditions" className="text-sm text-chart-2 underline-offset-4 hover:underline">Change weather or power cuts</Link>
        <Link href="/features/energyresilience/compare" className="text-sm text-chart-2 underline-offset-4 hover:underline">See how this beats a normal battery rule</Link>
      </div>
    </>
  );
}
