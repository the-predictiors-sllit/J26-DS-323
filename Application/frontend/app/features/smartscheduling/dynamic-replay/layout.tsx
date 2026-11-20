import { connection } from "next/server";
import { SchedulerProvider } from "../_milp/state/store";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await connection();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <SchedulerProvider today={today}>{children}</SchedulerProvider>;
}
