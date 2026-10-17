// Small hand-drawn SVG charts so the page needs no extra chart library.
import { hh } from "../_lib/format";

const W = 720;
const H = 260;
const M = { l: 44, r: 16, t: 26, b: 30 };

export interface Series {
  name: string;
  values: number[];
  color: string;
  dashed?: boolean;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function LineChart({
  hours,
  series,
  outage,
  unit,
  yMax,
  refLine,
  label,
}: {
  hours: number[];
  series: Series[];
  outage?: number[];
  unit: string;
  yMax?: number;
  refLine?: { value: number; text: string };
  label: string;
}) {
  const n = hours.length;
  const top = yMax ?? niceMax(Math.max(...series.flatMap((s) => s.values), refLine?.value ?? 0));
  const x = (i: number) => M.l + (i / Math.max(n - 1, 1)) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - (v / top) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const bands: [number, number][] = [];
  outage?.forEach((o, i) => {
    if (!o) return;
    const last = bands[bands.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else bands.push([i, i]);
  });
  return (
    <div>
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full min-w-[600px]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {bands.map(([a, b]) => (
          <g key={a}>
            <rect x={x(a) - 6} y={M.t} width={x(b) - x(a) + 12} height={H - M.t - M.b} fill="var(--destructive)" opacity="0.18" />
            <text x={(x(a) + x(b)) / 2} y={M.t + 12} textAnchor="middle" fontSize="11" fill="var(--destructive)">
              Power cut
            </text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
            <text x={W - M.r} y={y(refLine.value) - 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {refLine.text}
            </text>
          </g>
        )}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeDasharray={s.dashed ? "6 4" : undefined}
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
        {hours.map((h, i) =>
          i % 3 === 0 ? (
            <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              {hh(h)}
            </text>
          ) : null,
        )}
        <text x={M.l} y={12} fontSize="11" fill="var(--muted-foreground)">
          {unit}
        </text>
      </svg>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-5 rounded" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Bar {
  label: string;
  value: number;
  color: string;
}

export function BarChart({ bars, unit, label, decimals = 2 }: { bars: Bar[]; unit: string; label: string; decimals?: number }) {
  const top = niceMax(Math.max(...bars.map((b) => b.value), 0.0001));
  const bw = (W - M.l - M.r) / bars.length;
  const y = (v: number) => H - M.b - (v / top) * (H - M.t - M.b - 14);
  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full min-w-[600px]">
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--border)" />
      {bars.map((b, i) => {
        const cx = M.l + i * bw + bw / 2;
        const h = Math.max(H - M.b - y(b.value), 2);
        return (
          <g key={b.label}>
            <rect x={cx - bw * 0.28} y={H - M.b - h} width={bw * 0.56} height={h} rx="6" fill={b.color} />
            <text x={cx} y={H - M.b - h - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--foreground)">
              {b.value.toFixed(decimals)}
            </text>
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              {b.label}
            </text>
          </g>
        );
      })}
      <text x={M.l} y={12} fontSize="11" fill="var(--muted-foreground)">
        {unit}
      </text>
    </svg>
      </div>
  );
}

export interface Dot {
  label: string;
  x: number;
  y: number;
  color: string;
}

export function ScatterChart({ dots, xLabel, yLabel, label }: { dots: Dot[]; xLabel: string; yLabel: string; label: string }) {
  const xs = dots.map((d) => d.x);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const pad = (xmax - xmin) * 0.12 || 1;
  const ymax = niceMax(Math.max(...dots.map((d) => d.y), 1));
  const sx = (v: number) => M.l + 10 + ((v - (xmin - pad)) / (xmax - xmin + 2 * pad)) * (W - M.l - M.r - 20);
  const sy = (v: number) => H - M.b - (v / ymax) * (H - M.t - M.b);
  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full min-w-[600px]">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={M.l} x2={W - M.r} y1={sy(f * ymax)} y2={sy(f * ymax)} stroke="var(--border)" />
          <text x={M.l - 6} y={sy(f * ymax) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
            {Math.round(f * ymax)}
          </text>
        </g>
      ))}
      {[...dots].sort((a, b) => a.x - b.x).map((d, i) => (
        <g key={d.label}>
          <circle cx={sx(d.x)} cy={sy(d.y)} r="8" fill={d.color} />
          <text x={sx(d.x)} y={i % 2 === 0 ? sy(d.y) - 14 : sy(d.y) - 30} textAnchor="middle" fontSize="11" fill="var(--foreground)">
            {d.label}
          </text>
        </g>
      ))}
      <text x={M.l + 10} y={H - M.b + 14} fontSize="10" fill="var(--muted-foreground)">{Math.round(xmin).toLocaleString("en-US")}</text>
      <text x={W - M.r - 10} y={H - M.b + 14} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{Math.round(xmax).toLocaleString("en-US")}</text>
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
        {xLabel}
      </text>
      <text x={M.l} y={12} fontSize="11" fill="var(--muted-foreground)">
        {yLabel}
      </text>
    </svg>
      </div>
  );
}

export function HourStrip({
  hours,
  outage,
  weather,
}: {
  hours: number[];
  outage: number[];
  weather: ("sunny" | "cloudy" | "rainy" | null)[];
}) {
  const wc = { sunny: "bg-chart-1/70", cloudy: "bg-muted-foreground/40", rainy: "bg-sky-500/60" } as const;
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {hours.map((h, i) => (
          <div key={i} className="text-center">
            <div className={`h-3 rounded-sm ${weather[i] ? wc[weather[i] as keyof typeof wc] : "bg-muted"}`} title={weather[i] ?? "normal weather"} />
            <div className={`mt-1 h-3 rounded-sm ${outage[i] ? "bg-destructive" : "bg-muted"}`} title={outage[i] ? "power cut" : "grid on"} />
            <div className="mt-1 text-[10px] text-muted-foreground">{i % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Top row: weather. Bottom row: red means a power cut. Numbers are the hour of the day.</p>
    </div>
  );
}
