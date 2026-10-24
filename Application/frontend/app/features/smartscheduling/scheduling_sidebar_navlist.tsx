import { Sparkles } from "lucide-react";
import type { RailItem } from "../components/sidebar_interfaces";

export const NAV: RailItem[] = [
  {
    id: "solar_prediction",
    label: "Manual Solar Prediction",
    icon: <Sparkles aria-hidden="true" />,
    link: "/features/smartscheduling/manualsolarpredition",
  },
  {
    id: "solar_scheduler",
    label: "Solar Scheduler",
    icon: <Sparkles aria-hidden="true" />,
    link: "/features/smartscheduling/scheduler",
  },
];
