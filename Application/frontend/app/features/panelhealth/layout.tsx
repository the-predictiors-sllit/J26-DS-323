import { IndividualSidebar } from "../components/sidebar";
import { NAV } from "./health_sidebar_navlist";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IndividualSidebar NAV={NAV} functionName="Panel Health">{children}</IndividualSidebar>;
}