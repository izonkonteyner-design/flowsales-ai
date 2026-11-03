import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function SectionCard({ title, description, className, children }: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-4 border-b border-border pb-3">
          {title ? (
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}
