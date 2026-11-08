"use client";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Frame } from "../actions";

const config = {
  predicted_kw: { label: "Predicted", color: "var(--chart-1)" },
  actual_kw: { label: "Inverter reading", color: "var(--chart-2)" },
  original_load_kw: { label: "Original load", color: "var(--chart-3)" },
  revised_load_kw: { label: "Revised load", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function PowerPlot({ history }: { history: Frame[] }) {
  return <Card><CardHeader><CardTitle>Power over time</CardTitle><CardDescription>Recorded point readings and slot estimates are not measured interval averages.</CardDescription></CardHeader><CardContent><ChartContainer config={config} className="aspect-auto h-72 w-full"><LineChart accessibilityLayer data={history.map((item) => ({ ...item, time: item.timestamp.slice(11, 16) }))}><CartesianGrid vertical={false} /><XAxis dataKey="time" minTickGap={35} /><YAxis width={45} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />{Object.keys(config).map((key) => <Line key={key} dataKey={key} stroke={`var(--color-${key})`} dot={false} connectNulls={false} isAnimationActive={false} />)}</LineChart></ChartContainer></CardContent></Card>;
}
