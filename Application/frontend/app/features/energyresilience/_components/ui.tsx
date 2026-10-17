import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm ${className}`}>{children}</section>;
}

export function Heading({ n, title, hint }: { n?: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {n !== undefined && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-chart-2">{n}</span>
      )}
      <div>
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "bad" | "warn" }) {
  const color = { default: "text-foreground", good: "text-emerald-400", bad: "text-destructive", warn: "text-chart-2" }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "bad" | "warn" }) {
  const cls = {
    default: "bg-muted text-muted-foreground",
    good: "bg-emerald-500/15 text-emerald-400",
    bad: "bg-destructive/15 text-destructive",
    warn: "bg-primary/25 text-chart-2",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export const inputCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls = {
    primary: "bg-chart-2 text-black hover:bg-chart-1",
    outline: "border border-border bg-transparent hover:bg-muted",
    danger: "bg-destructive text-white hover:opacity-90",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: "bad" | "warn" | "good" | "info"; children: ReactNode }) {
  const cls = {
    bad: "border-destructive/40 bg-destructive/10 text-destructive",
    warn: "border-primary/40 bg-primary/15 text-chart-1",
    good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    info: "border-border bg-muted text-muted-foreground",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
