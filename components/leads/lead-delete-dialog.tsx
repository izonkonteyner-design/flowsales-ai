"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";

import { deleteLeadAction } from "@/app/(app)/leads/actions";

type LeadDeleteDialogProps = {
  leadId: string;
  leadName: string;
  redirectTo: string;
  buttonLabel?: string;
};

export function LeadDeleteDialog({
  leadId,
  leadName,
  redirectTo,
  buttonLabel = "Delete",
}: LeadDeleteDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
      >
        <Trash2 className="h-4 w-4" />
        {buttonLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lead-delete-title"
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_120px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="lead-delete-title" className="text-lg font-semibold text-slate-950 dark:text-white">
                  Delete lead
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  This will permanently remove <span className="font-medium text-slate-950 dark:text-white">{leadName}</span> from the current organization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:hover:bg-white/5"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={deleteLeadAction} className="mt-6 flex flex-wrap gap-3">
              <input type="hidden" name="lead_id" value={leadId} />
              <input type="hidden" name="redirect_to" value={redirectTo} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-500"
              >
                Confirm delete
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
