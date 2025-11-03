import Sidebar from "@/components/Sidebar/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import React from "react";

function page() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar />

        {/* Right content */}
        <div className="flex-1 flex flex-col h-screen">
          <main className="overflow-y-auto"></main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default page;
