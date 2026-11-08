"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Activity, AlertTriangle, ArrowRight, RefreshCw, Sun, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readLiveMeasurement, readLiveStatus, type LiveResponse } from "./actions";

export function LiveDashboard({ initial }: { initial: LiveResponse }) {
  const [state, setState] = useState(initial);
  const [reading, setReading] = useState<LiveResponse>({});
  const [pending, transition] = useTransition();
  const implemented = state.status?.provider_implemented === true;
  function refresh() {
    transition(async () => {
      const next = await readLiveStatus();
      setState(next);
      // Never retain a previous measurement after an unsuccessful refresh.
      setReading(next.status?.provider_implemented ? await readLiveMeasurement() : {});
    });
  }
  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium tracking-widest text-primary">SMART SCHEDULING / LIVE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Live solar monitoring</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">A separate workspace for a future inverter connection and live scheduling.</p></div><Button variant="outline" onClick={refresh} disabled={pending}><RefreshCw />{pending ? "Checking…" : "Refresh status"}</Button></div>
    <div role="status" className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-semibold">{implemented ? "Provider code is present; connection has not been verified" : "Live integration is not connected"}</p><p className="mt-1 text-muted-foreground">{implemented ? "A provider implementation is available. A successful recent measurement is required before using its data." : "The SolisCloud adapter is a placeholder. No live generation is being collected and no appliance schedules are being changed."}</p></div></div>
    {state.error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{state.error}</p>}
    {reading.error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{reading.error}</p>}
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardDescription>Data provider</CardDescription><CardTitle className="flex items-center gap-2"><WifiOff className="size-5 text-muted-foreground" />{state.status?.provider ?? "Unavailable"}</CardTitle></CardHeader><CardContent><span className="text-sm text-muted-foreground">{implemented ? "Implementation present · not verified" : "Not implemented"}</span></CardContent></Card><Card><CardHeader><CardDescription>Latest solar generation</CardDescription><CardTitle className="flex items-center gap-2"><Sun className="size-5 text-primary" />{reading.reading ? `${reading.reading.power_kw.toFixed(2)} kW` : "—"}</CardTitle></CardHeader><CardContent><span className="text-sm text-muted-foreground">{reading.reading ? `Reading: ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" }).format(new Date(reading.reading.timestamp))} · Asia/Colombo` : "No live reading"}</span></CardContent></Card><Card><CardHeader><CardDescription>Automatic rescheduling</CardDescription><CardTitle className="flex items-center gap-2"><Activity className="size-5 text-muted-foreground" />Unavailable</CardTitle></CardHeader><CardContent><span className="text-sm text-muted-foreground">No background monitor or appliance control is connected.</span></CardContent></Card></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>What this page needs</CardTitle><CardDescription>Live data and trustworthy execution state are separate inputs.</CardDescription></CardHeader><CardContent><ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground"><li>Implement the server-side provider using authorized SolisCloud access.</li><li>Store forecasts and readings with their availability and measurement times.</li><li>Connect a saved schedule and confirmed appliance states before enabling automatic rescheduling.</li></ol></CardContent></Card><Card><CardHeader><CardTitle>Explore the research replay</CardTitle><CardDescription>Test deviation handling against the supplied historical CSV.</CardDescription></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Replay results are simulations; they do not represent live measurements or control devices.</p><Button variant="outline" nativeButton={false} render={<Link href="/features/smartscheduling/dynamic-replay" />}>Open historical replay <ArrowRight /></Button></CardContent></Card></div>
  </main>;
}
