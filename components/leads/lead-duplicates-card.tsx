"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import { mergeLeadDuplicatesAction } from "@/app/(app)/leads/actions";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { canMergeDuplicateRecords, type DuplicateGroup, type DuplicateMatchReason } from "@/server/services/duplicate-detection";
import { formatCurrency } from "@/lib/utils";
import type { WorkspaceRole } from "@/lib/workspace-roles";

type DuplicateLeadRecord = {
  id: string;
  full_name: string;
  company: string;
  email: string;
  phone: string;
  estimated_value: number;
  currency: string;
  created_at: string;
};

type LeadDuplicatesCardProps = {
  groups: DuplicateGroup<DuplicateLeadRecord>[];
  redirectTo: string;
  role: WorkspaceRole | null | undefined;
  locale: "tr" | "en";
};

const copy = {
  tr: {
    title: "Olası Yinelenenler",
    description: "Aynı kişi veya şirkete ait birden fazla kayıt tespit edildi. İncele ve tek kayıtta birleştir.",
    reasonEmail: "E-posta eşleşti",
    reasonPhone: "Telefon eşleşti",
    reasonName: "Ad + şirket eşleşti",
    keep: "Ana kayıt olarak tut",
    merge: "Birleştir",
    cancel: "Vazgeç",
    noPermission: "Birleştirme işlemi için yönetici veya müdür yetkisi gerekir.",
    confirmTitle: "Yinelenen kayıtları birleştir",
    confirmBody: "Seçilmeyen kayıtlar silinecek; ilişkili teklif, görev, aktivite ve konuşma geçmişi ana kayda taşınacaktır. Bu işlem geri alınamaz.",
  },
  en: {
    title: "Possible Duplicates",
    description: "Multiple records appear to belong to the same person or company. Review and merge into one record.",
    reasonEmail: "Email matched",
    reasonPhone: "Phone matched",
    reasonName: "Name + company matched",
    keep: "Keep as canonical",
    merge: "Merge",
    cancel: "Cancel",
    noPermission: "Merging requires manager or admin permissions.",
    confirmTitle: "Merge duplicate records",
    confirmBody: "Records you don't keep will be deleted; their quotes, tasks, activities, and conversation history move to the kept record. This cannot be undone.",
  },
} as const;

const reasonLabelKey: Record<DuplicateMatchReason, "reasonEmail" | "reasonPhone" | "reasonName"> = {
  email: "reasonEmail",
  phone: "reasonPhone",
  name_company: "reasonName",
};

export function LeadDuplicatesCard({ groups, redirectTo, role, locale }: LeadDuplicatesCardProps) {
  const c = copy[locale];
  if (!groups.length) return null;

  const canMerge = canMergeDuplicateRecords(role);

  return (
    <SectionCard title={c.title} description={c.description}>
      <div className="space-y-3">
        {groups.map((group) => (
          <DuplicateGroupRow
            key={group.key}
            group={group}
            redirectTo={redirectTo}
            canMerge={canMerge}
            copy={c}
          />
        ))}
      </div>
    </SectionCard>
  );
}

type LeadDuplicatesCopy = (typeof copy)[keyof typeof copy];

function DuplicateGroupRow({
  group,
  redirectTo,
  canMerge,
  copy: c,
}: {
  group: DuplicateGroup<DuplicateLeadRecord>;
  redirectTo: string;
  canMerge: boolean;
  copy: LeadDuplicatesCopy;
}) {
  const [canonicalId, setCanonicalId] = useState(group.records[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const duplicateIds = group.records.filter((record) => record.id !== canonicalId).map((record) => record.id);

  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
        {group.reasons.map((reason) => (
          <StatusBadge key={reason} tone="warning">
            {c[reasonLabelKey[reason]]}
          </StatusBadge>
        ))}
      </div>

      <div className="space-y-1.5">
        {group.records.map((record) => (
          <label
            key={record.id}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
          >
            <input
              type="radio"
              name={`canonical-${group.key}`}
              checked={canonicalId === record.id}
              onChange={() => setCanonicalId(record.id)}
              disabled={!canMerge}
              aria-label={c.keep}
            />
            <span className="font-semibold text-foreground">{record.full_name}</span>
            <span className="text-muted-foreground">{record.company || "—"}</span>
            <span className="text-muted-foreground">{record.email || record.phone || "—"}</span>
            <span className="ml-auto font-medium text-foreground">
              {formatCurrency(record.estimated_value, record.currency)}
            </span>
            {canonicalId === record.id ? <StatusBadge tone="success">{c.keep}</StatusBadge> : null}
          </label>
        ))}
      </div>

      {canMerge ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          {confirming ? (
            <form action={mergeLeadDuplicatesAction} className="flex items-center gap-2">
              <input type="hidden" name="canonical_id" value={canonicalId} />
              {duplicateIds.map((id) => (
                <input key={id} type="hidden" name="duplicate_id" value={id} />
              ))}
              <input type="hidden" name="redirect_to" value={redirectTo} />
              <span className="text-[11px] text-muted-foreground">{c.confirmBody}</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                {c.cancel}
              </button>
              <button
                type="submit"
                className="inline-flex h-7 items-center rounded-md bg-amber-600 px-2.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 transition-colors"
              >
                {c.merge}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-amber-100 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 transition-colors dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            >
              {c.merge}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">{c.noPermission}</p>
      )}
    </div>
  );
}
