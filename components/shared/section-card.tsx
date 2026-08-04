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
        "group relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/85 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(15,23,42,0.12)] dark:border-white/[0.08] dark:bg-[linear-gradient(145deg,rgba(18,26,48,0.96),rgba(8,13,27,0.94))] dark:shadow-[0_24px_90px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent opacity-0 transition group-hover:opacity-100" />
      {(title || description) && (
        <div className="relative mb-5 border-b border-slate-200/60 pb-4 dark:border-white/[0.07]">
          {title ? <h2 className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2> : null}
          {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
      )}
      <div className="relative">{children}</div>
    </section>
  );
}
