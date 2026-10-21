import type { Metadata } from "next";
import { ApplianceManager } from "./appliance-manager";
export const metadata: Metadata = { title: "Appliances | SOLAI" };
export default function AppliancesPage() {
  return <ApplianceManager />;
}
