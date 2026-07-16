import { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  tone?: "blue" | "emerald" | "amber" | "violet";
};

const tones = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-500/20",
  emerald:
    "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20",
  amber:
    "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20",
  violet:
    "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/20",
} as const;

export function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "blue",
}: MetricCardProps) {
  return (
    <article className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {value}
          </p>
          {delta ? <p className="mt-2 text-sm text-slate-500">{delta}</p> : null}
        </div>

        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl ring-1",
            tones[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}
