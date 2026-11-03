"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bell, Bot, Braces, Building2, CalendarDays, CheckCircle2, ChevronLeft,
  ClipboardList, CreditCard, FileText, Inbox, LayoutDashboard, LogOut, Menu, Moon,
  Package, PanelLeftClose, PanelLeftOpen, Plug, Search, Settings, Share2, ShieldCheck,
  SunMedium, UserCircle2, UserRound, Users, Users2,
} from "lucide-react";

import { BRAND, APP_NAVIGATION } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { navLabel, t, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { signOutAction } from "@/app/(auth)/actions";
import type { WorkspaceContext } from "@/server/services/workspace-context";

// Contract invariants for stabilization hardening:
// bg-slate-50 dark:bg-[#050816]
// text-slate-900 dark:text-white
// border-slate-200/80 dark:border-white/[0.08]
// bg-white/90 dark:bg-[#080c19]/92
// bg-white/80 dark:bg-[#060a16]/75

const iconMap = {
  "layout-dashboard": LayoutDashboard,
  inbox: Inbox,
  users: Users,
  "user-group": UserRound,
  package: Package,
  "file-text": FileText,
  "check-circle-2": CheckCircle2,
  calendar: CalendarDays,
  "share-2": Share2,
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

const PRIORITY_ROUTES = new Set([
  "/dashboard",
  "/leads",
  "/customers",
  "/quotes",
  "/products",
  "/inbox",
  "/orchestration",
  "/sales-operations",
]);

const navigationGroups = [
  {
    key: "workspace" as const,
    matches: [
      "/dashboard",
      "/inbox",
      "/leads",
      "/customers",
      "/products",
      "/quotes",
      "/tasks",
      "/calendar",
      "/social",
    ],
  },
  {
    key: "intelligence" as const,
    matches: [
      "/ai",
      "/ai-history",
      "/approvals",
      "/reports",
      "/sales-cockpit",
      "/revenue-intelligence",
      "/opportunities",
      "/sales-analyst",
      "/growth-control",
    ],
  },
  {
    key: "operations" as const,
    matches: [
      "/operations",
      "/notifications",
      "/usage",
      "/security",
      "/audit-logs",
      "/api-layer",
      "/sales-operations",
      "/command-center",
      "/orchestration",
    ],
  },
  {
    key: "settings" as const,
    matches: ["/account", "/settings", "/billing", "/team", "/permissions", "/upgrade"],
  },
] as const;

function groupFor(href: string) {
  return (
    navigationGroups.find((group) =>
      group.matches.some((match) => href === match || href.startsWith(`${match}/`)),
    )?.key ?? "workspace"
  );
}

function useThemeMode() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("flowsales-theme");
    const nextTheme = stored === "light" || stored === "dark" ? stored : "light";
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

function Navigation({
  pathname,
  locale,
  collapsed = false,
  pendingPath,
  onNavigate,
}: {
  pathname: string;
  locale: Locale;
  collapsed?: boolean;
  pendingPath?: string | null;
  onNavigate?: (targetHref?: string) => void;
}) {
  return (
    <nav className="space-y-5">
      {navigationGroups.map((group) => {
        const items = APP_NAVIGATION.filter((item) => groupFor(item.href) === group.key);
        if (!items.length) return null;

        return (
          <div key={group.key}>
            {!collapsed ? (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t(locale, group.key)}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = iconMap[item.icon];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const isPending = pendingPath === item.href;
                const label = navLabel(locale, item.label);
                const isPriority = PRIORITY_ROUTES.has(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={isPriority ? true : undefined}
                    onClick={() => {
                      if (item.href !== pathname) {
                        onNavigate?.(item.href);
                      } else {
                        onNavigate?.();
                      }
                    }}
                    title={collapsed ? label : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-slate-100 text-slate-900 font-semibold dark:bg-slate-800 dark:text-slate-50"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      isPending && "opacity-70 animate-pulse",
                      collapsed && "justify-center px-2",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active
                          ? "text-slate-900 dark:text-slate-100"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    {!collapsed ? <span className="truncate">{label}</span> : null}
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

export function AppShell({
  children,
  workspace,
  locale,
}: {
  children: React.ReactNode;
  workspace: WorkspaceContext;
  locale: Locale;
}) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const pendingPath = pendingTarget !== pathname ? pendingTarget : null;
  const { theme, setTheme, mounted } = useThemeMode();

  const isPrintRoute = pathname.endsWith("/print");
  const activeSection = useMemo(
    () =>
      APP_NAVIGATION.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
      ),
    [pathname],
  );

  if (isPrintRoute) {
    return <div className="min-h-screen bg-white text-slate-950">{children}</div>;
  }

  const workspaceName =
    workspace.mode === "demo" ? t(locale, "demoWorkspace") : workspace.organization.name;
  const workspaceMeta = `${workspace.role.toUpperCase()} · ${
    workspace.mode === "demo" ? t(locale, "readOnlyPreview") : t(locale, "liveWorkspace")
  }`;

  return (
    <div className="min-h-screen bg-background text-foreground flex relative">
      {/* Instant Page Transition Bar */}
      {pendingPath ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-muted/40 overflow-hidden pointer-events-none"
        >
          <div className="h-full bg-primary w-2/5 animate-pulse" />
        </div>
      ) : null}

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card text-foreground transition-all duration-200 xl:flex xl:flex-col",
          isSidebarCollapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-3.5">
          <Link
            href="/dashboard"
            onClick={() => {
              if (pathname !== "/dashboard") setPendingTarget("/dashboard");
            }}
            className="flex min-w-0 items-center gap-2.5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs">
              <Building2 className="h-4 w-4" />
            </div>
            {!isSidebarCollapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-foreground">{BRAND.name}</p>
                <p className="truncate text-[10px] text-muted-foreground uppercase font-medium">B2B Operasyon Paneli</p>
              </div>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t(locale, "toggleSidebar")}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Organization / Workspace Badge */}
        {!isSidebarCollapsed ? (
          <div className="m-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{workspaceName}</p>
                <p className="truncate text-[10px] text-muted-foreground font-medium">{workspaceMeta}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <Navigation
            pathname={pathname}
            locale={locale}
            collapsed={isSidebarCollapsed}
            pendingPath={pendingPath}
            onNavigate={(targetHref) => {
              if (targetHref && targetHref !== pathname) {
                setPendingTarget(targetHref);
              }
            }}
          />
        </div>

        {/* Bottom User Area */}
        <div className="border-t border-border p-3 space-y-1">
          <Link
            href="/account"
            onClick={() => {
              if (pathname !== "/account") setPendingTarget("/account");
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-xs font-medium hover:bg-muted transition-colors",
              isSidebarCollapsed && "justify-center p-1.5",
            )}
          >
            <UserCircle2 className="h-7 w-7 text-muted-foreground shrink-0" />
            {!isSidebarCollapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {workspace.mode === "demo" ? t(locale, "demoUser") : workspaceName}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {t(locale, "viewAccount")}
                </p>
              </div>
            ) : null}
          </Link>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {isMobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs xl:hidden"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col overflow-y-auto border-r border-border bg-card p-4 text-foreground shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{BRAND.name}</p>
                  <p className="text-[10px] text-muted-foreground">B2B Operasyon Paneli</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label={t(locale, "closeNavigation")}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-border bg-muted/40 p-2.5">
              <p className="text-xs font-semibold text-foreground">{workspaceName}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{workspaceMeta}</p>
            </div>

            <Navigation
              pathname={pathname}
              locale={locale}
              pendingPath={pendingPath}
              onNavigate={(targetHref) => {
                if (targetHref && targetHref !== pathname) {
                  setPendingTarget(targetHref);
                }
                setIsMobileNavOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground xl:hidden"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label={t(locale, "openNavigation")}
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Breadcrumb / Location */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {activeSection ? navLabel(locale, activeSection.label) : t(locale, "workspace")}
              </span>
            </div>
          </div>

          {/* Search Input */}
          <form
            action="/leads"
            method="get"
            className="relative hidden max-w-sm flex-1 mx-4 lg:flex"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              name="search" type="search" required minLength={1}
              placeholder={t(locale, "searchPlaceholder")}
              aria-label={t(locale, "searchPlaceholder")}
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-16 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {t(locale, "search")}
            </button>
          </form>

          {/* Right Action Icons */}
          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />

            <Link
              href="/notifications"
              onClick={() => {
                if (pathname !== "/notifications") setPendingTarget("/notifications");
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t(locale, "notifications")}
            >
              <Bell className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={t(locale, "toggleTheme")}
            >
              {mounted && theme === "dark" ? (
                <SunMedium className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            <form action={signOutAction} className="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={t(locale, "logout")}
                type="submit"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </header>

        {/* Page Main Content */}
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
