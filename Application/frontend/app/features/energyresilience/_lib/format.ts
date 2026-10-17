import type { Condition, PlanHour, Profile } from "./types";

export const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

export const PROFILE_INFO: Record<Profile, { title: string; text: string; reserve: number }> = {
  savings: { title: "Prioritize saving", text: "Lowest bills. Keeps a small reserve, so a long outage may cut some power.", reserve: 20 },
  balanced: { title: "Balanced", text: "A fair mix of savings and backup. A good default for most homes.", reserve: 40 },
  resilience: { title: "Prioritize resilience", text: "Keeps a large reserve so critical power stays on, even at a higher cost.", reserve: 70 },
};

export const CONDITION_LABEL: Record<Condition, string> = { sunny: "Sunny", cloudy: "Cloudy", rainy: "Rainy" };

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface ActionView {
  label: string;
  tone: "reserve" | "charge" | "use" | "export" | "backup";
}

export function describeAction(a: PlanHour["action"]): ActionView {
  if (a.startsWith("outage")) return { label: "ON BACKUP", tone: "backup" };
  if (a.startsWith("charge")) return { label: "CHARGE", tone: "charge" };
  if (a.startsWith("use battery")) return { label: "SELF-CONSUME", tone: "use" };
  if (a.startsWith("export")) return { label: "EXPORT", tone: "export" };
  return { label: "RESERVE", tone: "reserve" };
}

export function reasonFor(view: ActionView, outageIn: number | null): string {
  const prep = outageIn !== null && outageIn > 0 ? ` Preparing for the power cut in ${outageIn} h.` : "";
  switch (view.tone) {
    case "backup": return "The grid is down. Solar and battery are running the critical loads.";
    case "charge": return `Storing spare solar energy for later.${prep}`;
    case "use": return "Using the battery for the home to save grid power.";
    case "export": return "Surplus solar is sold to the grid. No power cut is expected soon.";
    default: return `Holding the charge instead of spending it.${prep}`;
  }
}

export const lkr = (n: number) => `${n < 0 ? "-" : ""}LKR ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
