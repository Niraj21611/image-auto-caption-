"use client";

import type React from "react";
import {
  BookOpen,
  Settings,
  Users,
  PlusCircle,
  Home,
  GraduationCap,
  Library,
  Package,
  Eye,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

// shadcn sidebar
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { ProfileButton } from "./profileButton";

// ---------------- DATA ----------------
const navigationItems = [{ title: "Dashboard", url: "/", icon: Home }];

const courseManagementItems = [
  { title: "All Courses", url: "/course", icon: BookOpen },
  { title: "Manage Courses", url: "/course/manage", icon: Settings },
];

const meetingItems = [
  { title: "Live Classes", url: "/meet", icon: Users },
  { title: "Create Meeting", url: "/meet/manage", icon: PlusCircle },
];

const adminItems = [
  { title: "Instructors", url: "/admin/instructor", icon: Users },
  { title: "Students", url: "/student", icon: Users },
  { title: "Classes", url: "/admin/class", icon: GraduationCap },
  { title: "Subjects", url: "/admin/subject", icon: Library },
];

const subscriptionItems = [
  {
    title: "Manage Subscriptions",
    url: "/subscription/manage",
    icon: Settings,
  },
  { title: "All Subscriptions", url: "/subscription/all", icon: Package },
  { title: "User Subscriptions", url: "/subscription/users", icon: Eye },
];

// student-specific
const studentItems = [
  { title: "All Courses", url: "/student/course", icon: BookOpen },
];

// ---------------- COMPONENT ----------------
export default function Sidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isOpen = state === "expanded";

  const isMobile = useIsMobile();
  const isCollapsed = state === "collapsed";
  const { data: session } = useSession();
  const role = session?.user?.role; // make sure your session includes `role`

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 h-screen bg-card border-r border-border transition-all duration-300 ease-in-out",
        isOpen ? "w-64" : "w-16",
        "lg:relative lg:z-auto"
      )}
    >
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-oracle font-bold text-lg">EduPlatform</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
        {/* Mobile trigger */}
        <SidebarTrigger className="p-2 hover:bg-accent rounded-md transition-colors lg:hidden" />
      </div>

      {/* Navigation */}
      <div className="flex flex-col h-[calc(100vh-4rem)] mt-2">
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-2 space-y-4">
            {/* Show Admin sidebar */}
            {role === "ADMIN" && (
              <>
                <SidebarSection
                  title="Navigation"
                  items={navigationItems}
                  isActive={isActive}
                />
                <SidebarSection
                  title="Course "
                  items={courseManagementItems}
                  isActive={isActive}
                />
                <SidebarSection
                  title="Meeting"
                  items={meetingItems}
                  isActive={isActive}
                />
                <SidebarSection
                  title="Admin "
                  items={adminItems}
                  isActive={isActive}
                />
                <SidebarSection
                  title="Subscription "
                  items={subscriptionItems}
                  isActive={isActive}
                />
              </>
            )}

            {/* Show Student sidebar */}
            {role === "USER" && (
              <SidebarSection
                title="Course"
                items={studentItems}
                isActive={isActive}
              />
            )}
          </div>
        </ScrollArea>

        {/* Bottom Logout */}
        <div className="border-t p-4">
          <div
            className={cn(
              "flex w-full items-center",
              isCollapsed && !isMobile ? "flex-col gap-2" : "justify-between"
            )}
          >
            <div className="flex items-center gap-2">
              <ProfileButton />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => signOut()}
              title="Logout"
              className={cn("bg-red-500", isCollapsed && !isMobile && "mt-2")}
            >
              <LogOut className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop trigger */}
      <SidebarTrigger className="absolute top-4 -right-3 hidden lg:flex w-6 h-6 bg-card border border-border rounded-full items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-60" />
    </aside>
  );
}

// ---------------- SidebarSection ----------------
function SidebarSection({
  title,
  items,
  isActive,
}: {
  title: string;
  items: { title: string; url: string; icon: React.ComponentType<any> }[];
  isActive: (path: string) => boolean;
}) {
  const ParentIcon = items[0]?.icon ?? ChevronRight;
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Collapsible defaultOpen className="group/collapsible">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={cn(
                "flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
                isCollapsed && "justify-center p-3"
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-2",
                  isCollapsed && "justify-center"
                )}
              >
                <ParentIcon className="h-4 w-4" />
                {!isCollapsed && <span>{title}</span>}
              </span>
              {!isCollapsed && (
                <ChevronRight className="h-3 w-3 ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
              )}
            </SidebarMenuButton>
          </CollapsibleTrigger>

          {!isCollapsed && (
            <CollapsibleContent>
              <SidebarMenuSub>
                {items.map((item) => {
                  const Icon = item.icon;
                  const itemIsActive = isActive(item.url);
                  return (
                    <SidebarMenuSubItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={itemIsActive}
                        className={cn(
                          "transition-colors hover:bg-accent/50 hover:text-foreground",
                          itemIsActive &&
                            "bg-black text-white hover:bg-black/90 hover:text-white"
                        )}
                      >
                        <Link href={item.url}>
                          <Icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          )}
        </Collapsible>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
