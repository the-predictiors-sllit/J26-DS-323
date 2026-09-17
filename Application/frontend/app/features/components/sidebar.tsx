"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ActivityIcon, BarChart3Icon, InboxIcon, LayoutDashboardIcon, RocketIcon, SettingsIcon, ShieldCheckIcon } from 'lucide-react'

interface RailItem {
  id: string
  label: string
  icon: ReactNode
  badge?: number
  isActive?: boolean
}

const NAV: RailItem[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboardIcon aria-hidden="true" /> },
  { id: "inbox", label: "Inbox", badge: 12, icon: <InboxIcon aria-hidden="true" /> },
  { id: "deployments", label: "Deployments", isActive: true, icon: <RocketIcon aria-hidden="true" /> },
  { id: "monitoring", label: "Monitoring", icon: <ActivityIcon aria-hidden="true" /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3Icon aria-hidden="true" /> },
  { id: "audit", label: "Audit log", icon: <ShieldCheckIcon aria-hidden="true" /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon aria-hidden="true" /> },
]

function RailNav() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                render={<a href="#" />}
                isActive={item.isActive}
                tooltip={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
              </SidebarMenuButton>
              {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-sidebar-primary text-sidebar-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md",
        className
      )}
    >
      <svg viewBox="25.5002 25.1352 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-3">
        <circle cx="70.634" cy="29.8334" r="4.69799" fill="currentColor" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M25.668 57.0144V29.8332C25.668 27.2386 27.7713 25.1352 30.366 25.1352C32.9606 25.1352 35.0639 27.2386 35.0639 29.8332V57.0144C35.0639 61.833 38.9702 65.7392 43.7888 65.7392H57.2116C62.0302 65.7392 65.9364 61.833 65.9364 57.0144V43.7258C65.9364 41.1312 68.0398 39.0278 70.6344 39.0278C73.229 39.0278 75.3324 41.1312 75.3324 43.7258V57.0144C75.3324 67.0222 67.2194 75.1352 57.2116 75.1352H43.7888C33.7809 75.1352 25.668 67.0222 25.668 57.0144Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

function BrandButton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip="ReUI Labs" render={<a href="/home" />}>
          <BrandMark className="size-8 rounded-lg [&>svg]:size-4" />
          <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
            <span className="truncate text-sm font-medium">SOLAI</span>
            <span className="text-sidebar-foreground/70 truncate text-xs">Funstion name</span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function AccountButton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip="Nadia Rahman" render={<a href="#" />}>
          <Avatar>
            <AvatarImage src="https://github.com/shadcn.png" alt="" />
            <AvatarFallback>NR</AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
            <span className="truncate text-sm font-medium">Nadia Rahman</span>
            <span className="text-sidebar-foreground/70 truncate text-xs">Owner</span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function IndividualSidebar({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="relative h-dvh min-h-0 w-full overflow-hidden">
      <Sidebar collapsible="icon" className="absolute h-full">
        <SidebarHeader>
          <BrandButton />
        </SidebarHeader>

        <SidebarContent role="navigation" aria-label="Primary">
          <RailNav />
        </SidebarContent>

        <SidebarFooter>
          <AccountButton />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <h2 className="truncate text-sm font-medium">Dashboard</h2>
          <Button variant="outline" size="sm" className="ml-auto">
            Action
          </Button>
        </header>

        <div className="min-w-0 flex-1 overflow-auto p-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}