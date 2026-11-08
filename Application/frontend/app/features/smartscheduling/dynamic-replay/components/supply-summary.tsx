import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Frame } from "../actions";
import { estimateSupply } from "../supply-estimates";

/** Estimates only: the CSV does not include household or grid-meter readings. */
export function SupplySummary({ completed }: { completed: Frame[] }) {
  const totals = estimateSupply(completed);
  const amount = (value: number) => totals.coveredSlots ? `${value.toFixed(2)} kWh` : "Unavailable";
  return <Card><CardHeader><CardTitle>Estimated electricity supply so far</CardTitle><CardDescription>Simulated appliance and other household load · completed 15-minute slots</CardDescription></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">Estimated load</p><p className="mt-1 text-2xl font-semibold tabular-nums">{amount(totals.load)}</p></div><div><p className="text-sm text-muted-foreground">Estimated solar used</p><p className="mt-1 text-2xl font-semibold tabular-nums">{amount(totals.solarUsed)}</p></div><div><p className="text-sm text-muted-foreground">Estimated grid needed</p><p className="mt-1 text-2xl font-semibold tabular-nums">{amount(totals.gridShortfall)}</p></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Calculated for {totals.coveredSlots} of {totals.totalSlots} completed slots with solar readings. This assumes an available grid supplies any shortfall, no battery, and a constant point reading across each slot. Appliance operation and other load are simulated. This is not measured grid import or total household consumption; missing slots are excluded.</p></CardContent></Card>;
}
