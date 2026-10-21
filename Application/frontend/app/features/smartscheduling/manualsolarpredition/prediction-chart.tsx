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
import type { Prediction } from "./config";

export function PredictionChart({ rows }: { rows: Prediction[] }) {
  if (!rows.length) return null;

  // Timestamps already contain Sri Lankan local time (+05:30). Slicing keeps
  // the chart independent of the viewer's browser timezone.
  const dates = [
    ...new Set(rows.map((row) => row.timestamp.slice(0, 10))),
  ].sort();
  const times = [
    ...new Set(rows.map((row) => row.timestamp.slice(11, 16))),
  ].sort();
  const config: ChartConfig = {};
  const keys = new Map(dates.map((date, index) => [date, `day_${index}`]));
  dates.forEach((date, index) => {
    config[`day_${index}`] = {
      label: date,
      color: `var(--chart-${(index % 5) + 1})`,
    };
  });
  const points = new Map<string, Record<string, string | number | null>>(
    times.map((time) => [
      time,
      {
        time,
        ...Object.fromEntries(dates.map((date) => [keys.get(date)!, null])),
      },
    ]),
  );
  rows.forEach((row) => {
    points.get(row.timestamp.slice(11, 16))![
      keys.get(row.timestamp.slice(0, 10))!
    ] = row.predicted_power_kw;
  });
  const data = times.map((time) => points.get(time)!);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Predicted solar power</CardTitle>
        <CardDescription>
          Predicted power in kW · Sri Lankan time (UTC +05:30).
          {dates.length > 1
            ? " Each line represents a separate date."
            : ` ${dates[0]}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={config}
          className="h-80 w-full aspect-auto sm:h-96"
          aria-label={`Solar power predictions for ${dates.join(", ")}, in kilowatts`}
        >
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ top: 16, right: 20, left: 4, bottom: 8 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={35}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={62}
              domain={[0, "auto"]}
              tickFormatter={(value: number) =>
                `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} kW`
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `${label} · UTC +05:30`}
                  formatter={(value, name) => (
                    <div className="flex min-w-44 flex-1 items-center justify-between gap-5">
                      <span className="text-muted-foreground">
                        {String(name)}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {Number(value).toLocaleString("en-US", {
                          maximumFractionDigits: 3,
                        })}{" "}
                        kW
                      </span>
                    </div>
                  )}
                />
              }
            />
            {dates.length > 1 && (
              <ChartLegend
                content={
                  <ChartLegendContent className="flex-wrap gap-x-5 gap-y-2" />
                }
              />
            )}
            {dates.map((date, index) => (
              <Line
                key={date}
                dataKey={keys.get(date)!}
                name={date}
                type="linear"
                stroke={`var(--color-day_${index})`}
                strokeWidth={2}
                strokeDasharray={
                  index >= 5 ? `${4 + Math.floor(index / 5) * 2} 3` : undefined
                }
                dot={
                  rows.filter((row) => row.timestamp.startsWith(date))
                    .length === 1
                    ? { r: 4 }
                    : false
                }
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Hover or use the chart&apos;s keyboard navigation to inspect
          predictions. Lines connect model outputs; they do not represent
          additional predictions between the selected slots.
        </p>
      </CardContent>
    </Card>
  );
}
