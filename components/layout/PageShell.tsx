"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { WorkspaceContext } from "@/server/services/workspace-context";
import { APP_NAVIGATION } from "@/lib/constants";

function PageShellInner({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace: WorkspaceContext;
}) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { theme, mounted } = useTheme();
  const isPrintRoute = pathname.endsWith("/print");

  const activeSection = useMemo(
    () => APP_NAVIGATION.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    [pathname]
  );

  // Persist sidebar state
  useEffect(() => {
    const stored = localStorage.getItem("flowsales-sidebar-collapsed");
    if (stored !== null) {
      setIsSidebarCollapsed(stored === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("flowsales-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  if (isPrintRoute) {
    return <div className="min-h-screen bg-white text-slate-950 p-6 print:max-w-none">{children}</div>;
  }

  return (
    <div
      className={cn(
        "min-h-screen",
        "bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef2ff_45%,#f8fafc)]",
        "text-slate-950",
        "dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_28%),linear-gradient(to_bottom,#020617,#0f172a_40%,#020617)]",
        "dark:text-white"
      )}
    >
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar
          workspace={workspace}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
          isMobileOpen={isMobileNavOpen}
          onMobileClose={() => setIsMobileNavOpen(false)}
        />

        <div className="flex flex-1 flex-col min-w-0">
          <TopBar
            workspace={workspace}
            activeSectionLabel={activeSection?.label}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
            onMobileMenuOpen={() => setIsMobileNavOpen(true)}
          />

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function PageShell({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace: WorkspaceContext;
}) {
  return (
    <ThemeProvider>
      <PageShellInner children={children} workspace={workspace} />
    </ThemeProvider>
  );
}