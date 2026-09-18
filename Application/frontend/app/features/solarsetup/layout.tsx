import { IndividualSidebar } from "../components/sidebar";
import { NAV } from "./angle_sidebar_navlist";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IndividualSidebar NAV={NAV} functionName="Solar Setup"> {children} </IndividualSidebar>;
}