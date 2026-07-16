"use client";

import { Trash2 } from "lucide-react";

import { deleteQuoteAction } from "@/app/(app)/quotes/actions";
import type { QuoteRecordMode } from "@/server/services/quote-domain";
import type { WorkspaceRole } from "@/server/services/workspace-context";

type QuoteDeleteDialogProps = {
  quoteId: string;
  quoteNumber: string;
  redirectTo: string;
  recordMode: QuoteRecordMode;
  role: WorkspaceRole | null | undefined;
  restrictionMessage: string;
};

function canDelete(recordMode: QuoteRecordMode, role: WorkspaceRole | null | undefined) {
  return recordMode === "live" && (role === "owner" || role === "admin" || role === "sales");
}

export function QuoteDeleteDialog({
  quoteId,
  quoteNumber,
  redirectTo,
  recordMode,
  role,
  restrictionMessage,
}: QuoteDeleteDialogProps) {
  const allowed = canDelete(recordMode, role);

  return (
    <form action={deleteQuoteAction}>
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button
        type="submit"
        disabled={!allowed}
        title={allowed ? `Delete ${quoteNumber}` : restrictionMessage}
        onClick={(event) => {
          if (!allowed) {
            event.preventDefault();
            return;
          }

          if (!window.confirm(`Delete quote ${quoteNumber}? This action cannot be undone.`)) {
            event.preventDefault();
          }
        }}
        className="inline-flex h-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </button>
    </form>
  );
}
