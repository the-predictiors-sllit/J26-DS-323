"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarClock, CloudSun, History, Scale, SlidersHorizontal } from "lucide-react";
import { IndividualSidebar } from "../components/sidebar";
import type { RailItem } from "../components/sidebar_interfaces";
import { EnergyProvider } from "./_lib/store";

const BASE = "/features/energyresilience";

export default function EnergyResilienceLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isOn = (href: string) => (href === BASE ? path === BASE : path.startsWith(href));

  const NAV: RailItem[] = [
    { id: "setup", label: "Setup", icon: <SlidersHorizontal aria-hidden />, link: BASE },
    { id: "plan", label: "Today's plan", icon: <CalendarClock aria-hidden />, link: `${BASE}/plan` },
    { id: "conditions", label: "Conditions", icon: <CloudSun aria-hidden />, link: `${BASE}/conditions` },
    { id: "compare", label: "Compare", icon: <Scale aria-hidden />, link: `${BASE}/compare` },
    { id: "history", label: "History", icon: <History aria-hidden />, link: `${BASE}/history` },
  ].map((n) => ({ ...n, isActive: isOn(n.link) }));

  return (
    <EnergyProvider>
      <IndividualSidebar NAV={NAV} functionName="Energy Resilience">
        <div className="mx-auto max-w-5xl space-y-6 px-1 pb-8 md:px-4">
          <span className="inline-block rounded-full bg-primary/25 px-3 py-1 text-xs font-medium text-chart-1">
            Simulated demo. No real hardware is connected.
          </span>
          {children}
        </div>
      </IndividualSidebar>
    </EnergyProvider>
  );
}
