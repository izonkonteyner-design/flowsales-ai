"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type FlashToastProps = {
  message: string;
  tone?: "success" | "warning" | "danger" | "info";
};

const toneClasses: Record<NonNullable<FlashToastProps["tone"]>, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100",
  danger: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100",
  info: "border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-slate-950/90 dark:text-white",
};

const toneIcons: Record<NonNullable<FlashToastProps["tone"]>, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
};

export function FlashToast({ message, tone = "info" }: FlashToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) {
    return null;
  }

  const Icon = toneIcons[tone];

  return (
    <div className="fixed right-4 top-4 z-50">
      <div
        className={cn(
          "flex max-w-md items-start gap-3 rounded-2xl border p-4 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur",
          toneClasses[tone],
        )}
        role="status"
        aria-live="polite"
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm font-medium leading-6">{message}</p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="ml-2 rounded-full px-2 py-1 text-xs font-medium opacity-70 transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label="Dismiss notification"
        >
          Close
        </button>
      </div>
    </div>
  );
}
