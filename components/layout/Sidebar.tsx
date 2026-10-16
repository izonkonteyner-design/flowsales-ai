"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Braces,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Image,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  Users2,
  FileText,
  CheckCircle2,
  UserRound,
} from "lucide-react";

import { APP_NAVIGATION } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { WorkspaceContext } from "@/server/services/workspace-context";

const iconMap = {
  "layout-dashboard": LayoutDashboard,
  users: Users,
  "user-group": UserRound,
  package: Package,
  "file-text": FileText,
  "check-circle-2": CheckCircle2,
  calendar: CalendarDays,
  bot: Bot,
  "bar-chart-3": BarChart3,
  "credit-card": CreditCard,
  "users-2": Users2,
  "shield-check": ShieldCheck,
  "clipboard-list": ClipboardList,
  braces: Braces,
  settings: Settings,
  smartphone: Smartphone,
  image: Image,
} as const;

interface SidebarProps {
  workspace: WorkspaceContext;
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  workspace,
  isCollapsed,
  onToggle,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();

  const activeSection = APP_NAVIGATION.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/80 lg:block",
        isCollapsed ? "w-16" : "w-64",
        isMobileOpen ? "fixed z-40 lg:static" : ""
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-full flex-col">
        {/* Logo / Brand */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200/70 dark:border-white/10">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2 font-semibold text-slate-950 dark:text-white",
              isCollapsed && "justify-center"
            )}
            onClick={onMobileClose}
            aria-label="FlowSales AI - Dashboard"
          >
            <span className="h-8 w-8 rounded-xl bg-slate-950 flex items-center justify-center dark:bg-white">
              <Search className="h-5 w-5 text-white dark:text-slate-950" aria-hidden="true" />
            </span>
            {!isCollapsed && <span>FlowSales AI</span>}
          </Link>
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
            onClick={onMobileClose}
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1" role="navigation" aria-label="Sidebar navigation">
          {APP_NAVIGATION.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] ?? LayoutDashboard;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white",
                  isCollapsed && "justify-center px-2"
                )}
                aria-current={isActive ? "page" : undefined}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Workspace info / User */}
        <div className="border-t border-slate-200/70 p-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className={cn("h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0", isCollapsed && "mx-auto")}>
              <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {workspace.mode === "demo" ? "Demo workspace" : workspace.organization.name}
                </p>
                <p className="text-sm font-medium text-slate-950 dark:text-white truncate">
                  {workspace.mode === "demo" ? "Preview" : workspace.role}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle button */}
        <button
          type="button"
          className={cn(
            "absolute -right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-white border border-slate-200 shadow-md hover:bg-slate-50 dark:bg-slate-800 dark:border-white/10 dark:hover:bg-slate-700",
            "lg:hidden"
          )}
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5 text-slate-600 dark:text-slate-400" /> : <PanelLeftClose className="h-5 w-5 text-slate-600 dark:text-slate-400" />}
        </button>
      </div>
    </aside>
  );
}