import Link from "next/link";
import { FolderOpen } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground mb-3">
        <FolderOpen className="h-5 w-5" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-sm sm:text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex h-8 sm:h-9 items-center justify-center rounded-lg bg-primary px-3 sm:px-4 text-xs sm:text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
