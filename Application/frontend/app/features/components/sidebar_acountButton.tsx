"use client"


import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar"
import {
    SidebarMenu, SidebarMenuButton,
    SidebarMenuItem
} from "@/components/ui/sidebar"




export function AccountButton() {
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="Nadia Rahman" render={<a href="#" />}>
                    <Avatar>
                        <AvatarImage src="https://github.com/shadcn.png" alt="" />
                        <AvatarFallback>UN</AvatarFallback>
                    </Avatar>
                    <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
                        <span className="truncate text-sm font-medium">User Name</span>
                        <span className="text-sidebar-foreground/70 truncate text-xs">Owner</span>
                    </span>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}