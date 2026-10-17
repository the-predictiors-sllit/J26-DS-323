"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { planAuto } from "./api";
import type { AutoPlan, LogEntry, OutageEvt, Settings, WeatherEvt } from "./types";

const KEY = "energy-resilience-v1";

const DEFAULTS: Settings = {
  profile: "balanced",
  buy: 45,
  sell: 28,
  batteryKwh: 5,
  pvKwp: 3.1,
  dailyKwh: 9,
  socPct: 60,
  month: 10,
  startHour: 8,
  isWeekend: false,
};

interface Saved {
  settings: Settings;
  weather: WeatherEvt[];
  outages: OutageEvt[];
  log: LogEntry[];
}

interface Store {
  settings: Settings;
  weather: WeatherEvt[];
  outages: OutageEvt[];
  hydrated: boolean;
  result: AutoPlan | null;
  loading: boolean;
  error: string | null;
  log: LogEntry[];
  update: (patch: Partial<Settings>) => void;
  applyClock: () => void;
  setWeather: (w: WeatherEvt[]) => void;
  setOutages: (o: OutageEvt[]) => void;
  runPlan: () => Promise<AutoPlan | null>;
  loadDemo: () => void;
  clearConditions: () => void;
  clearLog: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useEnergy(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEnergy must be used inside EnergyProvider");
  return c;
}

export function EnergyProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [weather, setWeather] = useState<WeatherEvt[]>([]);
  const [outages, setOutages] = useState<OutageEvt[]>([]);
  const [result, setResult] = useState<AutoPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load what the user saved last time, otherwise use the computer clock for month and hour.
  useEffect(() => {
    const now = new Date();
    const clock = { month: now.getMonth() + 1, startHour: now.getHours(), isWeekend: now.getDay() === 0 || now.getDay() === 6 };
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        setSettings({ ...DEFAULTS, ...s.settings });
        setWeather(s.weather ?? []);
        setOutages(s.outages ?? []);
        setLog(s.log ?? []);
      } else {
        setSettings((p) => ({ ...p, ...clock }));
      }
    } catch {
      setSettings((p) => ({ ...p, ...clock }));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Wait until the saved data has been loaded, otherwise the empty defaults overwrite it (seen in dev mode).
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ settings, weather, outages, log } satisfies Saved));
    } catch {
      /* private mode: the app still works, it just forgets on refresh */
    }
  }, [hydrated, settings, weather, outages, log]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((p) => ({ ...p, ...patch })), []);

  const runPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await planAuto(settings, weather, outages);
      setResult(r);
      const outageHours = r.outage_forecast.reduce((a, b) => a + b, 0);
      setLog((p) =>
        [
          {
            time: new Date().toISOString(),
            profile: r.profile,
            outageHours,
            unservedKwh: r.comparison.mpc.unserved_critical_kwh,
            ruleUnservedKwh: r.comparison.plain_rule.unserved_critical_kwh,
            note: r.notes[0] ?? "No outage expected in the next 24 hours.",
          },
          ...p,
        ].slice(0, 30),
      );
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [settings, weather, outages]);

  const applyClock = useCallback(() => {
    const now = new Date();
    setSettings((p) => ({ ...p, month: now.getMonth() + 1, startHour: now.getHours(), isWeekend: now.getDay() === 0 || now.getDay() === 6 }));
  }, []);

  const loadDemo = useCallback(() => {
    setSettings((p) => ({ ...p, socPct: 25, startHour: 15, batteryKwh: 5, pvKwp: 3.1, dailyKwh: 9, profile: "balanced" }));
    setWeather([{ startIn: 0, duration: 3, condition: "rainy" }]);
    setOutages([{ startIn: 4, duration: 5 }]);
  }, []);

  const clearConditions = useCallback(() => {
    setWeather([]);
    setOutages([]);
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  const value = useMemo<Store>(
    () => ({ settings, weather, outages, hydrated, result, loading, error, log, update, applyClock, setWeather, setOutages, runPlan, loadDemo, clearConditions, clearLog }),
    [settings, weather, outages, hydrated, result, loading, error, log, update, applyClock, runPlan, loadDemo, clearConditions, clearLog],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
