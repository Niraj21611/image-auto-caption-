"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import Sidebar from "@/components/Sidebar/Sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar />

        {/* Right content */}
        <div className="flex-1 flex flex-col h-screen">
          <main className="overflow-y-auto">
            <div className="w-full min-h-full">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
