import type { Metadata } from "next";
import { SchedulerDashboard } from "./scheduler-dashboard";
export const metadata: Metadata = { title: "Solar scheduler | SOLAI" };
export default function SchedulerPage() {
  return <SchedulerDashboard />;
}
