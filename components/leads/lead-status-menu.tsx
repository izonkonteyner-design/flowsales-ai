import { CheckCircle2 } from "lucide-react";

import { changeLeadStatusAction } from "@/app/(app)/leads/actions";
import { LEAD_STATUSES } from "@/lib/constants";
import { Select } from "@/components/ui/select";

type LeadStatusMenuProps = {
  leadId: string;
  currentStatus: string;
  redirectTo: string;
  label?: string;
  className?: string;
  compact?: boolean;
};

export function LeadStatusMenu({
  leadId,
  currentStatus,
  redirectTo,
  label = "Update status",
  className,
  compact = false,
}: LeadStatusMenuProps) {
  return (
    <form action={changeLeadStatusAction} className={className}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />

      <div className={compact ? "space-y-2" : "flex flex-col gap-2"}>
        <label className="sr-only" htmlFor={`status-${leadId}`}>
          Lead status
        </label>
        <Select id={`status-${leadId}`} name="status" defaultValue={currentStatus}>
          {LEAD_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <CheckCircle2 className="h-4 w-4" />
          {label}
        </button>
      </div>
    </form>
  );
}
