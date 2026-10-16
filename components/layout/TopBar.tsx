"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronRight, Command, LayoutDashboard, LogOut, Moon, Search, SunMedium, UserCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(auth)/actions";
import { useTheme } from "./ThemeProvider";
import { CommandPalette } from "@/components/command-palette";
import type { WorkspaceContext } from "@/server/services/workspace-context";
import type { CommandAction } from "@/lib/command-palette";

interface TopBarProps {
  workspace: WorkspaceContext;
  activeSectionLabel: string | undefined;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onMobileMenuOpen: () => void;
}

export function TopBar({
  workspace,
  activeSectionLabel,
  isSidebarCollapsed,
  onToggleSidebar,
  onMobileMenuOpen,
}: TopBarProps) {
  const { theme, setTheme, mounted, toggleTheme } = useTheme();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const commandActions: CommandAction[] = [
    { id: "new-lead", label: "New Lead", description: "Create a new lead", icon: "User", href: "/leads/new" },
    { id: "new-quote", label: "New Quote", description: "Create a new quote", icon: "FileText", href: "/quotes/new" },
    { id: "new-task", label: "New Task", description: "Create a new task", icon: "CheckSquare", href: "/tasks" },
    { id: "ai-assistant", label: "AI Assistant", description: "Open AI sales assistant", icon: "Zap", href: "/ai" },
  ];

  return (
    <>
      <header className="sticky top-0 z-20 h-16 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/80">
        <div className="flex h-full items-center justify-between px-4">
          {/* Left side - Mobile menu toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
              onClick={onMobileMenuOpen}
              aria-label="Open menu"
              aria-expanded="false"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>
          </div>

          {/* Center - Active section indicator */}
          <div className="hidden lg:flex items-center gap-2 px-4">
            <LayoutDashboard className="h-4 w-4 text-slate-500" />
            <span className="max-w-[240px] truncate text-slate-700 dark:text-slate-300 font-medium">
              {activeSectionLabel ?? "Workspace"}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* User / Account */}
            <Link
              href="/account"
              className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <UserCircle2 className="h-5 w-5 text-slate-500" />
              <div className="leading-tight">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {workspace.mode === "demo" ? "Demo user" : "Signed in"}
                </p>
                <p className="font-medium text-slate-950 dark:text-white">
                  {workspace.mode === "demo" ? "Workspace preview" : workspace.organization.name}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>

            {/* Logout */}
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" aria-label="Log out" type="submit">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={commandActions}
      />
    </>
  );
}