"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useEffect, useRef } from "react";

export type DropdownOption = {
  value: string;
  label: string;
  description?: string;
};

type Props = {
  options: DropdownOption[];
  triggerLabel?: string;
  paramKey?: string;
  basePath: string;
};

export function QuickStartDropdown({
  options,
  triggerLabel = "New Chat",
  paramKey = "type",
  basePath,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (value: string) => {
    setPending(value);
    setOpen(false);
    const sep = basePath.includes("?") ? "&" : "?";
    router.push(`${basePath}${sep}${paramKey}=${encodeURIComponent(value)}`);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending !== null}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {pending === options[0]?.value ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {triggerLabel}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-slate-950">
          <ul className="space-y-1">
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-white/5"
                  disabled={pending !== null}
                >
                  <div className="flex-1">
                    <p className="font-medium">{opt.label}</p>
                    {opt.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</p>
                    )}
                  </div>
                  {pending === opt.value && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
