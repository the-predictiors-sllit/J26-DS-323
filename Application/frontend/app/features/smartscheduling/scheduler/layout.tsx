import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { SchedulerProvider } from "../_milp/state/store";

export default async function SchedulerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) =>
    parts.find((value) => value.type === name)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return (
    <SchedulerProvider today={today}>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
        <nav aria-label="Solar scheduler" className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/features/smartscheduling/scheduler" />}
          >
            Schedule
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href="/features/smartscheduling/scheduler/appliances" />
            }
          >
            Appliance library
          </Button>
        </nav>
        {children}
      </div>
    </SchedulerProvider>
  );
}
