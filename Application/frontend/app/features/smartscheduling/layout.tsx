import { IndividualSidebar } from "../components/sidebar";
import { NAV } from "./scheduling_sidebar_navlist";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IndividualSidebar NAV={NAV} functionName="Smart Scheduling">{children}</IndividualSidebar>;
}