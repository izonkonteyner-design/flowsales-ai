import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-white/80 px-6 py-6 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[linear-gradient(135deg,rgba(18,27,49,0.96),rgba(7,12,26,0.95))] dark:shadow-[0_28px_90px_rgba(0,0,0,0.38)] lg:flex lg:items-end lg:justify-between lg:px-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/12 blur-3xl dark:bg-violet-500/20" />
      <div className="pointer-events-none absolute bottom-0 left-20 h-px w-64 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
      <div className="relative max-w-3xl space-y-2">
        {eyebrow ? (
          <p className="inline-flex rounded-full border border-violet-200/70 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200">
            {eyebrow}
          </p>
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {actions ? <div className="relative mt-5 flex flex-wrap gap-3 lg:mt-0 lg:justify-end">{actions}</div> : null}
    </div>
  );
}
