import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "success" | "warning" | "danger";
};

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-slate-950 text-white dark:bg-white dark:text-slate-950",
  secondary: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
