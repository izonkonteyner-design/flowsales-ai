import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
  children: React.ReactNode;
  className?: string;
  title?: string;
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700",
  info: "bg-blue-50 text-blue-700 border-blue-200/70 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900/50",
  warning: "bg-amber-50 text-amber-800 border-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/50",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50",
  danger: "bg-rose-50 text-rose-800 border-rose-200/70 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/50",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  title,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      title={title}
    >
      {children}
    </span>
  );
}
