import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Frame } from "../actions";

export function GenerationSummary({ completed }: { completed: Frame[] }) {
  const measured = completed.filter((item) => item.actual_kw !== null);
  const predicted = completed.reduce((sum, item) => sum + item.predicted_kw * 0.25, 0);
  const observed = measured.reduce((sum, item) => sum + item.actual_kw! * 0.25, 0);
  return <Card><CardHeader><CardTitle>Generation so far</CardTitle><CardDescription>Completed 15-minute slots in the simulated day · estimates in kWh</CardDescription></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Predicted generation</p><p className="mt-1 text-2xl font-semibold tabular-nums">{predicted.toFixed(2)} kWh</p></div><div><p className="text-sm text-muted-foreground">Recorded generation estimate</p><p className="mt-1 text-2xl font-semibold tabular-nums">{measured.length ? `${observed.toFixed(2)} kWh` : "Unavailable"}</p></div><div><p className="text-sm text-muted-foreground">Reading coverage</p><p className="mt-1 text-2xl font-semibold tabular-nums">{measured.length} / {completed.length} slots</p></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Each estimate treats a point reading or prediction as constant for one slot. Missing readings are excluded, so totals with incomplete coverage are not directly comparable and are not meter energy.</p></CardContent></Card>;
}
