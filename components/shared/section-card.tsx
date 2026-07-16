import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function SectionCard({
  title,
  description,
  className,
  children,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title ? (
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {title}
            </h2>
          ) : null}

          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
}
