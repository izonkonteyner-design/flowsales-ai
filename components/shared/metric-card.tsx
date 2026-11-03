import { ArrowUpRight, ArrowDownRight, LucideIcon } from "lucide-react";

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
    iconBg: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  emerald: {
    iconBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  amber: {
    iconBg: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  violet: {
    iconBg: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  },
} as const;

export function MetricCard({ label, value, delta, icon: Icon, tone = "blue" }: MetricCardProps) {
  const isNegative = delta ? delta.startsWith("-") : false;
  const isPositive = delta ? delta.startsWith("+") : false;
  const style = tones[tone] || tones.blue;

  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</span>
        <div className={cn("flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg", style.iconBg)}>
          <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
        </div>
      </div>
      <div className="mt-2 sm:mt-3">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
          {value}
        </div>
        {delta ? (
          <div className="mt-1.5 flex items-center gap-1 text-xs font-medium">
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : isNegative ? (
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            ) : null}
            <span
              className={cn(
                isPositive && "text-emerald-600 dark:text-emerald-400",
                isNegative && "text-rose-600 dark:text-rose-400",
                !isPositive && !isNegative && "text-muted-foreground",
              )}
            >
              {delta}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
