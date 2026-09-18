import type { ReactNode } from "react"

export interface RailItem {
  id: string
  label: string
  icon: ReactNode
  badge?: number
  isActive?: boolean
  link?: string
}