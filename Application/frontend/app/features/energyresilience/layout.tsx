import { IndividualSidebar } from "../components/sidebar";
import { NAV } from "./battery_sidebar_navlist";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IndividualSidebar NAV={NAV} functionName="Energy Resilience">{children}</IndividualSidebar>;
}