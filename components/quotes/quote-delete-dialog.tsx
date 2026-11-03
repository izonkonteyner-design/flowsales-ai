"use client";

import { Trash2 } from "lucide-react";

import { deleteQuoteAction } from "@/app/(app)/quotes/actions";
import type { QuoteRecordMode } from "@/server/services/quote-domain";
import { canWriteSalesRecords, type WorkspaceRole } from "@/lib/workspace-roles";

type QuoteDeleteDialogProps = {
  quoteId: string;
  quoteNumber: string;
  redirectTo: string;
  recordMode: QuoteRecordMode;
  role: WorkspaceRole | null | undefined;
  restrictionMessage: string;
};

function canDelete(recordMode: QuoteRecordMode, role: WorkspaceRole | null | undefined) {
  return recordMode === "live" && canWriteSalesRecords(role);
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
    <form action={deleteQuoteAction} className="inline-flex">
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button
        type="submit"
        disabled={!allowed}
        title={allowed ? `${quoteNumber} numaralı teklifi sil` : restrictionMessage}
        onClick={(event) => {
          if (!allowed) {
            event.preventDefault();
            return;
          }

          if (!window.confirm(`${quoteNumber} numaralı teklif kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) {
            event.preventDefault();
          }
        }}
        className="inline-flex h-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <Trash2 className="mr-1 h-3 w-3" />
        Sil
      </button>
    </form>
  );
}
