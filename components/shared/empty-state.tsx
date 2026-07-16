import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-8 dark:border-white/10 dark:bg-white/5">
      <div className="max-w-lg space-y-2">
        <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
          {title}
        </h3>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>

      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
