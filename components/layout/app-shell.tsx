"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  Braces,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Command,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SunMedium,
  UserCircle2,
  UserRound,
  Users,
  Users2,
  Zap,
} from "lucide-react";

import { BRAND, APP_NAVIGATION } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(auth)/actions";
import type { WorkspaceContext } from "@/server/services/workspace-context";

const iconMap = {
  "layout-dashboard": LayoutDashboard,
  users: Users,
  "user-group": UserRound,
  package: Package,
  "file-text": FileText,
  "check-circle-2": CheckCircle2,
  calendar: CalendarDays,
  bell: Bell,
  bot: Bot,
  "bar-chart-3": BarChart3,
  "credit-card": CreditCard,
  "users-2": Users2,
  "shield-check": ShieldCheck,
  "clipboard-list": ClipboardList,
  braces: Braces,
  plug: Plug,
  settings: Settings,
} as const;

const navigationGroups = [
  { label: "Workspace", matches: ["/dashboard", "/leads", "/customers", "/products", "/quotes", "/tasks", "/calendar"] },
  { label: "Intelligence", matches: ["/ai", "/ai-history", "/approvals", "/reports"] },
  { label: "Operations", matches: ["/operations", "/notifications", "/usage", "/security", "/audit-logs", "/api-layer"] },
  { label: "Settings", matches: ["/account", "/settings", "/billing", "/team", "/permissions", "/upgrade"] },
] as const;

function groupFor(href: string) {
  return navigationGroups.find((group) => group.matches.some((match) => href === match || href.startsWith(`${match}/`)))?.label ?? "Workspace";
}

function useThemeMode() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("flowsales-theme");
    const nextTheme = stored === "light" || stored === "dark" ? stored : "dark";
    const frame = window.requestAnimationFrame(() => {
      setTheme(nextTheme);
      setMounted(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("flowsales-theme", theme);
  }, [mounted, theme]);

  return { theme, setTheme, mounted };
}

function Navigation({ pathname, collapsed = false, onNavigate }: { pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="space-y-6">
      {navigationGroups.map((group) => {
        const items = APP_NAVIGATION.filter((item) => groupFor(item.href) === group.label);
        if (!items.length) return null;
        return (
          <div key={group.label}>
            {!collapsed ? <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500/80">{group.label}</p> : null}
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = iconMap[item.icon];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-gradient-to-r from-violet-500/20 via-blue-500/15 to-cyan-500/10 text-white shadow-[inset_0_0_0_1px_rgba(139,92,246,.28),0_10px_28px_rgba(37,99,235,.12)]"
                        : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                      collapsed && "justify-center px-2",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-violet-400 to-cyan-300" /> : null}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-300" : "text-slate-500 group-hover:text-slate-200")} />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children, workspace }: { children: React.ReactNode; workspace: WorkspaceContext }) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { theme, setTheme, mounted } = useThemeMode();
  const isPrintRoute = pathname.endsWith("/print");
  const activeSection = useMemo(
    () => APP_NAVIGATION.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    [pathname],
  );

  if (isPrintRoute) return <div className="min-h-screen bg-white text-slate-950">{children}</div>;

  const workspaceName = workspace.mode === "demo" ? "Demo workspace" : workspace.organization.name;
  const workspaceMeta = `${workspace.role.toUpperCase()} · ${workspace.mode === "demo" ? "Read-only preview" : "Live workspace"}`;

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(124,58,237,.18),transparent_26%),radial-gradient(circle_at_85%_15%,rgba(14,165,233,.12),transparent_24%),linear-gradient(180deg,#050816_0%,#070b18_46%,#050816_100%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1800px]">
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-white/[0.08] bg-[#080c19]/92 backdrop-blur-2xl xl:flex xl:flex-col", isSidebarCollapsed ? "w-[88px]" : "w-[286px]")}> 
          <div className="flex h-20 items-center justify-between border-b border-white/[0.08] px-4">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 shadow-[0_0_35px_rgba(99,102,241,.32)]"><Sparkles className="h-5 w-5" /></div>
              {!isSidebarCollapsed ? <div className="min-w-0"><p className="truncate text-sm font-semibold">{BRAND.name}</p><p className="truncate text-[11px] text-slate-500">AI revenue workspace</p></div> : null}
            </Link>
            <button type="button" onClick={() => setIsSidebarCollapsed((value) => !value)} className="rounded-xl p-2 text-slate-500 hover:bg-white/[0.06] hover:text-white" aria-label="Toggle sidebar">
              {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {!isSidebarCollapsed ? <div className="mx-3 mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-violet-300" /><div className="min-w-0"><p className="truncate text-sm font-medium">{workspaceName}</p><p className="truncate text-xs text-slate-500">{workspaceMeta}</p></div></div></div> : null}
          <div className="flex-1 overflow-y-auto px-3 py-5"><Navigation pathname={pathname} collapsed={isSidebarCollapsed} /></div>
          <div className="border-t border-white/[0.08] p-3">
            {!isSidebarCollapsed ? <Link href="/usage" className="mb-3 block rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 via-blue-500/5 to-transparent p-3 transition hover:bg-white/[0.05]"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-medium text-violet-200"><Zap className="h-3.5 w-3.5" /> AI usage</span><span className="text-[11px] text-slate-500">View</span></div><p className="mt-2 text-[11px] text-slate-500">Open verified workspace usage metrics.</p></Link> : null}
            <Link href="/account" className={cn("flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 hover:bg-white/[0.06]", isSidebarCollapsed && "justify-center")}><UserCircle2 className="h-9 w-9 text-slate-400" />{!isSidebarCollapsed ? <div className="min-w-0"><p className="truncate text-sm font-medium">{workspace.mode === "demo" ? "Demo user" : workspaceName}</p><p className="truncate text-xs text-slate-500">View account</p></div> : null}</Link>
          </div>
        </aside>

        {isMobileNavOpen ? <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm xl:hidden" onClick={() => setIsMobileNavOpen(false)}><div className="absolute inset-y-0 left-0 w-[88vw] max-w-sm border-r border-white/[0.08] bg-[#080c19] p-4" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400"><Sparkles className="h-5 w-5" /></div><div><p className="font-semibold">{BRAND.name}</p><p className="text-xs text-slate-500">AI revenue workspace</p></div></div><button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-white/[0.06]" onClick={() => setIsMobileNavOpen(false)} aria-label="Close navigation"><ChevronLeft className="h-4 w-4" /></button></div><div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3"><p className="text-sm font-medium">{workspaceName}</p><p className="mt-1 text-xs text-slate-500">{workspaceMeta}</p></div><Navigation pathname={pathname} onNavigate={() => setIsMobileNavOpen(false)} /></div></div> : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#060a16]/75 backdrop-blur-2xl">
            <div className="flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-slate-300 xl:hidden" onClick={() => setIsMobileNavOpen(true)} aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
              <form action="/leads" method="get" className="relative hidden max-w-xl flex-1 lg:flex">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input name="search" type="search" placeholder="Search leads, customers, quotes, products..." className="h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] pl-10 pr-20 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/40 focus:ring-4 focus:ring-violet-500/10" />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.1]">Search</button>
              </form>
              <div className="ml-auto flex items-center gap-2">
                <Link href="/ai" className="hidden h-10 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-slate-300 hover:bg-white/[0.06] md:inline-flex"><Command className="h-4 w-4 text-violet-300" /><span>AI command</span></Link>
                <Link href="/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-slate-300 hover:bg-white/[0.06]" aria-label="Notifications"><Bell className="h-4 w-4" /></Link>
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-slate-300 hover:bg-white/[0.06]" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{mounted && theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
                <div className="hidden items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 lg:flex"><LayoutDashboard className="h-4 w-4 text-violet-300" /><span className="max-w-[160px] truncate text-sm text-slate-300">{activeSection?.label ?? "Workspace"}</span></div>
                <form action={signOutAction}><Button variant="ghost" size="icon" aria-label="Log out" type="submit"><LogOut className="h-4 w-4" /></Button></form>
              </div>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
