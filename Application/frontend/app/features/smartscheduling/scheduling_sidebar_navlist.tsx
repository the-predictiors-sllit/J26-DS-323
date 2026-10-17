import type { ReactNode } from "react"
import { ActivityIcon, BarChart3Icon, InboxIcon, LayoutDashboardIcon, RocketIcon, SettingsIcon, ShieldCheckIcon, Sparkles } from 'lucide-react'
import { RailItem } from "../components/sidebar_interfaces"


export const NAV: RailItem[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboardIcon aria-hidden="true" />, link: "#" },
  { id: "solar_prediction", label: "Manual Solar Prediction", icon: <Sparkles aria-hidden="true" />, link: "smartscheduling/manualsolarpredition" },
  { id: "settings", label: "Settings", icon: <SettingsIcon aria-hidden="true" />, link: "#" },
  // { id: "inbox", label: "Inbox", badge: 12, icon: <InboxIcon aria-hidden="true" />, link: "#" },
  // // { id: "deployments", label: "Deployments", isActive: true, icon: <RocketIcon aria-hidden="true" />, link: "#" },
  // { id: "monitoring", label: "Monitoring", icon: <ActivityIcon aria-hidden="true" />, link: "#" },
  // { id: "analytics", label: "Analytics", icon: <BarChart3Icon aria-hidden="true" />, link: "#" },
  // { id: "audit", label: "Audit log", icon: <ShieldCheckIcon aria-hidden="true" />, link: "#" },
]