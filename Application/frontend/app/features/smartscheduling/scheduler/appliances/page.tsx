import type { Metadata } from "next";
import { ApplianceManager } from "../../_milp/components/appliance-manager";
export const metadata: Metadata = { title: "Appliances | SOLAI" };
export default function AppliancesPage() {
  return <ApplianceManager />;
}
