import { CheckCircle2 } from "lucide-react";

import { changeLeadStatusAction } from "@/app/(app)/leads/actions";
import { LEAD_STATUSES } from "@/lib/constants";
import { getLeadRecordRestrictionMessage, getLeadStatusLabelTr } from "@/server/services/lead-domain";
import { Select } from "@/components/ui/select";
import type { WorkspaceRole } from "@/lib/workspace-roles";

type LeadStatusMenuProps = {
  leadId: string;
  currentStatus: string;
  redirectTo: string;
  recordMode: "demo" | "live";
  role?: WorkspaceRole | null;
  label?: string;
  className?: string;
  compact?: boolean;
};

export function LeadStatusMenu({
  leadId,
  currentStatus,
  redirectTo,
  recordMode,
  role,
  label = "Aşamayı Güncelle",
  className,
  compact = false,
}: LeadStatusMenuProps) {
  const disabledReason = getLeadRecordRestrictionMessage(recordMode, role);
  const disabled = Boolean(disabledReason);

  if (disabled) {
    return (
      <div className={className}>
        <div className={compact ? "space-y-1.5" : "flex flex-col gap-1.5"}>
          <label className="sr-only" htmlFor={`status-${leadId}`}>
            Lead durumu
          </label>
          <Select id={`status-${leadId}`} name="status" defaultValue={currentStatus} disabled className="h-8 text-xs">
            {LEAD_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {getLeadStatusLabelTr(status.value)}
              </option>
            ))}
          </Select>

          <button
            type="button"
            disabled
            title={disabledReason}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-muted px-3 text-xs font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {label}
          </button>
          <p className="text-[10px] text-muted-foreground">{disabledReason}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={changeLeadStatusAction} className={className}>
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="redirect_to" value={redirectTo} />

      <div className={compact ? "space-y-1.5" : "flex flex-col gap-1.5"}>
        <label className="sr-only" htmlFor={`status-${leadId}`}>
          Lead durumu
        </label>
        <Select id={`status-${leadId}`} name="status" defaultValue={currentStatus} disabled={disabled} className="h-8 text-xs">
          {LEAD_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {getLeadStatusLabelTr(status.value)}
            </option>
          ))}
        </Select>

        <button
          type="submit"
          disabled={disabled}
          title={disabledReason || undefined}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {label}
        </button>
        {disabledReason ? (
          <p className="text-[10px] text-muted-foreground">
            {disabledReason}
          </p>
        ) : null}
      </div>
    </form>
  );
}
