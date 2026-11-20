import { readLiveStatus } from "./actions";
import { LiveDashboard } from "./live-dashboard";

export default async function Page() {
  const initial = await readLiveStatus();
  return <LiveDashboard initial={initial} />;
}
