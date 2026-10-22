"use client";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Day } from "./types";
const config = {
  solar_kw: { label: "Predicted solar", color: "var(--chart-1)" },
  usable_solar_kw: { label: "Usable solar", color: "var(--chart-2)" },
  scheduled_total_kw: {
    label: "Appliances + background",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;
export function PowerChart({ day }: { day: Day }) {
  if (!day.slots.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Power balance</CardTitle>
        <CardDescription>
          15-minute scheduling values · kW · Sri Lankan time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-72 w-full aspect-auto">
          <LineChart
            accessibilityLayer
            data={day.slots.map((slot) => ({
              ...slot,
              time: slot.timestamp.slice(11, 16),
            }))}
            margin={{ left: 0, right: 15, top: 10 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              minTickGap={35}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              domain={[0, "auto"]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => `${day.date} ${value} · +05:30`}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {Object.keys(config).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="stepAfter"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                strokeDasharray={key === "usable_solar_kw" ? "4 3" : undefined}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          These are forecast-based slot estimates. Actual solar availability can
          differ.
        </p>
      </CardContent>
    </Card>
  );
}
