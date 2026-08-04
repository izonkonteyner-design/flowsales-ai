import { ArrowUpRight, LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  tone?: "blue" | "emerald" | "amber" | "violet";
};

const tones = {
  blue: {
    icon: "from-blue-500/25 to-cyan-400/10 text-blue-600 ring-blue-400/20 dark:text-blue-200",
    glow: "bg-blue-500/20",
    line: "from-blue-500 to-cyan-400",
  },
  emerald: {
    icon: "from-emerald-500/25 to-teal-400/10 text-emerald-600 ring-emerald-400/20 dark:text-emerald-200",
    glow: "bg-emerald-500/20",
    line: "from-emerald-500 to-teal-400",
  },
  amber: {
    icon: "from-amber-500/25 to-orange-400/10 text-amber-600 ring-amber-400/20 dark:text-amber-200",
    glow: "bg-amber-500/20",
    line: "from-amber-500 to-orange-400",
  },
  violet: {
    icon: "from-violet-500/25 to-fuchsia-400/10 text-violet-600 ring-violet-400/20 dark:text-violet-200",
    glow: "bg-violet-500/20",
    line: "from-violet-500 to-fuchsia-400",
  },
} as const;

export function MetricCard({ label, value, delta, icon: Icon, tone = "blue" }: MetricCardProps) {
  const style = tones[tone];
  return (
    <article className="group relative overflow-hidden rounded-[26px] border border-slate-200/70 bg-white/85 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_90px_rgba(15,23,42,0.13)] dark:border-white/[0.08] dark:bg-[linear-gradient(145deg,rgba(19,28,51,0.98),rgba(8,13,27,0.96))] dark:shadow-[0_24px_90px_rgba(0,0,0,0.36)]">
      <div className={cn("pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl", style.glow)} />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-3 truncate text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">{value}</p>
          {delta ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
              {delta}
            </p>
          ) : null}
        </div>
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ring-1", style.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
        <div className={cn("h-full w-2/3 rounded-full bg-gradient-to-r opacity-80 transition-all duration-500 group-hover:w-5/6", style.line)} />
      </div>
    </article>
  );
}
