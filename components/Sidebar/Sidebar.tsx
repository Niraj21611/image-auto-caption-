"use client";

import { Home, Users, Settings, LogOut, UserPlus, Workflow, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/use-is-mobile";
import ProfileButton from "./ProfileButton";

export default function Sidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isOpen = state === "expanded";
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const role = session?.user?.role;

  const isActive = (path: string) => pathname === path;

  // Sidebar items based on role
  const sidebarItems =
    role === "ADMIN"
      ? [
          { title: "Dashboard", url: "/admin", icon: Home },
          { title: "User Management", url: "/admin/user", icon: Users },
          { title: "Assign Batch", url: "/admin/assign", icon: UserPlus },
          { title: "Process Batch", url: "/admin/process", icon: Workflow },
          { title: "Settings", url: "/admin/setting", icon: Settings },
        ]
      : [
          { title: "Dashboard", url: "/user", icon: Home },
          { title: "Review", url: "/user/review", icon: ClipboardCheck },
          { title: "Settings", url: "/user/setting", icon: Settings },
        ];

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 h-screen bg-neutral-50 border-r border-neutral-200 transition-all duration-300 ease-in-out shadow-sm",
        isOpen ? "w-64" : "w-16",
        "lg:relative lg:z-auto"
      )}
    >
      {/* Header */}
      <div className="border-b border-neutral-200 p-4 flex items-center justify-between bg-white">
        {isOpen ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
              <Home className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-neutral-800">Sakal</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-600 to-blue-700 flex items-center justify-center mx-auto shadow-md">
            <Home className="w-4 h-4 text-white" />
          </div>
        )}
        <SidebarTrigger className="p-2 hover:bg-neutral-100 rounded-md transition-colors lg:hidden text-neutral-600" />
      </div>

      {/* Navigation */}
      <div className="flex flex-col h-[calc(100vh-4rem)] mt-2">
        <ScrollArea className="flex-1 overflow-hidden">
          <SidebarMenu className="px-4 py-6 space-y-3">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.url);

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    className={cn(
                      "flex items-center gap-4 p-6 text-base font-medium rounded-md transition-all duration-200",
                      active
                        ? "bg-blue-600! text-white! shadow-md hover:bg-blue-700!"
                        : "text-neutral-700 hover:bg-white hover:text-blue-600 hover:shadow-sm"
                    )}
                  >
                    <Link
                      href={item.url}
                      className="flex items-center gap-4 w-full p-4 "
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          active ? "text-white" : "text-neutral-500"
                        )}
                      />
                      {!isCollapsed && (
                        <span className="truncate">{item.title}</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-neutral-200 p-4 bg-white">
          <div
            className={cn(
              "flex w-full items-center gap-2",
              isCollapsed && !isMobile ? "flex-col" : "justify-between"
            )}
          >
            <ProfileButton />
            <Button
              variant="outline"
              size="icon"
              onClick={() => signOut()}
              title="Logout"
              className={cn(
                "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 hover:text-red-700 transition-colors shadow-sm",
                isCollapsed && !isMobile && "mt-2"
              )}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <SidebarTrigger className="absolute top-4 -right-3 hidden lg:flex w-6 h-6 bg-white border border-neutral-200 rounded-full items-center justify-center text-neutral-500 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm z-60" />
    </aside>
  );
}
