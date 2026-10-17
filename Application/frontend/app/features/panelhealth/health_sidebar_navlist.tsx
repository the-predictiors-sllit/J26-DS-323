import { ShieldCheckIcon } from "lucide-react"
import { RailItem } from "../components/sidebar_interfaces"

export const NAV: RailItem[] = [
  { id: "check", label: "Panel check", isActive: true, icon: <ShieldCheckIcon aria-hidden="true" />, link: "/features/panelhealth" },
]
