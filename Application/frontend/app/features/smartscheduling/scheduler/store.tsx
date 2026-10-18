"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { addDays, validateAppliance, type Appliance, type Job, type Settings } from "./types";

type Snapshot = { appliances: Appliance[]; settings: Settings; job: Job | null; submitted: string };
type Store = Snapshot & { today: string; ready: boolean; storageError: string; update: (patch: Partial<Snapshot>) => void };
const Context = createContext<Store | null>(null);
const KEY = "solai.scheduler.v1";

export function SchedulerProvider({ children, today }: { children: ReactNode; today: string }) {
  const defaults: Snapshot = { appliances: [], settings: { latitude: 6.2353, longitude: 80.055, pv_capacity_kwp: 15, start_date: addDays(today, 1), prediction_model_minutes: 15, solar_safety_factor: .9, background_load_kw: 0, max_household_power_kw: null }, job: null, submitted: "" };
  const [snapshot, setSnapshot] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Snapshot | null;
      if (saved && Array.isArray(saved.appliances) && saved.appliances.length <= 30 && saved.appliances.every(item => !validateAppliance(item)) && saved.settings && typeof saved.settings.start_date === "string") {
        const settings = { ...defaults.settings, ...saved.settings };
        if (settings.start_date < today || settings.start_date > addDays(today, 2)) settings.start_date = addDays(today, 1);
        setSnapshot({ appliances: saved.appliances, settings, job: saved.job ?? null, submitted: saved.submitted ?? "" });
      }
    } catch { setStorageError("Saved browser data could not be read. You can continue with a new draft."); }
    setReady(true);
    // Initial restoration only; updates are persisted below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(snapshot)); setStorageError(""); }
    catch { setStorageError("Browser storage is unavailable or full. Keep this page open; export your appliances before leaving."); }
  }, [snapshot, ready]);
  return <Context.Provider value={{ ...snapshot, today, ready, storageError, update: patch => setSnapshot(previous => ({ ...previous, ...patch })) }}>{children}</Context.Provider>;
}

export function useScheduler() { const value = useContext(Context); if (!value) throw new Error("Use SchedulerProvider."); return value; }
