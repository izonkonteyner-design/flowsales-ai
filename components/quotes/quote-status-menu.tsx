import { CheckCircle2 } from "lucide-react";

import { changeQuoteStatusAction } from "@/app/(app)/quotes/actions";
import { QUOTE_STATUSES } from "@/lib/constants";
import { getQuoteRecordRestrictionMessage } from "@/server/services/quote-domain";
import { Select } from "@/components/ui/select";

type QuoteStatusMenuProps = {
  quoteId: string;
  currentStatus: string;
  redirectTo: string;
  recordMode: "demo" | "live";
  role?: "owner" | "admin" | "sales" | "viewer" | null;
  label?: string;
  className?: string;
};

export function QuoteStatusMenu({
  quoteId,
  currentStatus,
  redirectTo,
  recordMode,
  role,
  label = "Save stage",
  className,
}: QuoteStatusMenuProps) {
  const disabledReason = getQuoteRecordRestrictionMessage(recordMode, role);
  const disabled = Boolean(disabledReason);

  if (disabled) {
    return (
      <div className={className}>
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`quote-status-${quoteId}`}>
            Quote status
          </label>
          <Select id={`quote-status-${quoteId}`} name="status" defaultValue={currentStatus} disabled>
            {QUOTE_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled
            title={disabledReason}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <CheckCircle2 className="h-4 w-4" />
            {label}
          </button>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{disabledReason}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={changeQuoteStatusAction} className={className}>
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />

      <div className="space-y-2">
        <label className="sr-only" htmlFor={`quote-status-${quoteId}`}>
          Quote status
        </label>
        <Select id={`quote-status-${quoteId}`} name="status" defaultValue={currentStatus} disabled={disabled}>
          {QUOTE_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          disabled={disabled}
          title={disabledReason || undefined}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <CheckCircle2 className="h-4 w-4" />
          {label}
        </button>
      </div>
    </form>
  );
}
