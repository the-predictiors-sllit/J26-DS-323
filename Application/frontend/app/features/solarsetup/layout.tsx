/*import { IndividualSidebar } from "../components/sidebar";
import { NAV } from "./angle_sidebar_navlist";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IndividualSidebar NAV={NAV} functionName="Solar Setup"> {children} </IndividualSidebar>;
}*/

'use client';
import { IndividualSidebar } from '../components/sidebar';
import { NAV } from './angle_sidebar_navlist';
import { useSection } from './_lib/navigation';
export default function SolarSetupLayout({ children }: { children: React.ReactNode }) {
  const section = useSection();
  return <IndividualSidebar NAV={NAV.map(item => ({ ...item, isActive: item.id === section }))} functionName="Solar Setup">{children}</IndividualSidebar>;
}
