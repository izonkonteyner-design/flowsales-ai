"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  Braces,
  ChevronLeft,
  ChevronRight,
  Command,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  UserCircle2,
  UserRound,
  Users2,
  Users,
  FileText,
  CheckCircle2,
  Moon,
  SunMedium,
} from "lucide-react";

import { BRAND, APP_NAVIGATION } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
  settings: Settings,
} as const;

function useThemeMode() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("flowsales-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";

    const frame = window.requestAnimationFrame(() => {
      setTheme(nextTheme);
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("flowsales-theme", theme);
  }, [mounted, theme]);

  return { theme, setTheme, mounted };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { theme, setTheme, mounted } = useThemeMode();

  const activeSection = useMemo(
    () => APP_NAVIGATION.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    [pathname],
  );

  async function handleSignOut() {
    setIsSigningOut(true);
    const client = getSupabaseBrowserClient();

    if (client) {
      await client.auth.signOut();
    }

    router.push("/login");
    router.refresh();
    setIsSigningOut(false);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef2ff_45%,#f8fafc)] text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_28%),linear-gradient(to_bottom,#020617,#0f172a_40%,#020617)] dark:text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-slate-950/80 xl:flex xl:flex-col",
            isSidebarCollapsed ? "w-[92px]" : "w-[288px]",
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200/70 px-4 dark:border-white/10">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>

              {!isSidebarCollapsed ? (
                <div>
                  <p className="text-sm font-semibold">{BRAND.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{BRAND.tagline}</p>
                </div>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/10"
              aria-label="Toggle sidebar"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <nav className="space-y-1">
              {APP_NAVIGATION.map((item) => {
                const Icon = iconMap[item.icon];
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                      isActive
                        ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
                      isSidebarCollapsed && "justify-center px-2",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!isSidebarCollapsed ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-slate-200/70 p-4 dark:border-white/10">
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5",
                isSidebarCollapsed && "justify-center",
              )}
            >
              <UserCircle2 className="h-10 w-10 text-slate-500" />
              {!isSidebarCollapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950 dark:text-white">
                    Demo Operator
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    owner@flowsales.ai
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        {isMobileNavOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950/50 xl:hidden" onClick={() => setIsMobileNavOpen(false)}>
            <div
              className="absolute inset-y-0 left-0 w-[86vw] max-w-sm border-r border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{BRAND.name}</p>
                    <p className="text-xs text-slate-500">{BRAND.tagline}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  onClick={() => setIsMobileNavOpen(false)}
                  aria-label="Close navigation"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>

              <nav className="space-y-1">
                {APP_NAVIGATION.map((item) => {
                  const Icon = iconMap[item.icon];
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileNavOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                        isActive
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur dark:border-white/10 dark:bg-slate-950/75">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 xl:hidden dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="relative hidden max-w-lg flex-1 items-center lg:flex">
                <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search leads, quotes, products..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-white/20 dark:focus:ring-white/10"
                />
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <Command className="h-4 w-4" />
                  <span className="hidden md:inline">Command</span>
                </button>

                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label="Toggle theme"
                >
                  {mounted && theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 lg:flex">
                  <LayoutDashboard className="h-4 w-4 text-slate-500" />
                  <span className="max-w-[180px] truncate text-slate-700 dark:text-slate-300">
                    {activeSection?.label ?? "Workspace"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>

                <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5 md:flex">
                  <UserCircle2 className="h-5 w-5 text-slate-500" />
                  <div className="leading-tight">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Demo user</p>
                    <p className="font-medium text-slate-950 dark:text-white">Selin Kaya</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>

                <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleSignOut} disabled={isSigningOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
