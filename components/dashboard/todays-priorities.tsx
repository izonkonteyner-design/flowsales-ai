import Link from "next/link";
import { ArrowUpRight, Clock3, Flame, Target } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import { listSalesExecutionPriorities } from "@/server/services/sales-execution-v2";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = {
  new_lead: "Yeni lead",
  discovery: "İhtiyaç analizi",
  qualified: "Nitelikli",
  quote_ready: "Teklife hazır",
  quote_sent: "Teklif gönderildi",
  negotiation: "Pazarlık",
};

const actionLabels: Record<string, string> = {
  ask_question: "Eksik bilgiyi sor",
  share_information: "Bilgi paylaş",
  create_quote: "Teklif hazırla",
  follow_up: "Takip et",
  call: "Ara",
  no_action: "İşlem yok",
};

export async function TodaysPriorities() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return null;

  let priorities;
  try {
    priorities = await listSalesExecutionPriorities({
      organizationId: ctx.organization.id,
      userId: ctx.userId,
      userRole: ctx.role,
      limit: 5,
    });
  } catch {
    return null;
  }

  return (
    <SectionCard
      title="Bugünün öncelikleri"
      description="Lead skoru, satış aşaması ve gecikmiş takip kriterlerine göre sıralanan kritik aksiyonlar."
    >
      {priorities.length ? (
        <div className="space-y-2.5">
          {priorities.map((item, index) => (
            <Link
              key={item.conversationId}
              href={item.href}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-muted/50 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground">
                  #{index + 1}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.contactName}
                    </p>
                    <StatusBadge
                      tone={
                        item.priority === "high"
                          ? "danger"
                          : item.priority === "medium"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {item.priority === "high"
                        ? "Yüksek Öncelik"
                        : item.priority === "medium"
                          ? "Orta"
                          : "Düşük"}
                    </StatusBadge>
                    <StatusBadge tone="info">Skor {item.score}</StatusBadge>
                    <StatusBadge tone="neutral">
                      {stageLabels[item.salesStage] || item.salesStage}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Target className="h-3.5 w-3.5 shrink-0 text-foreground" />
                    <span>
                      <strong className="text-foreground">
                        {actionLabels[item.nextBestActionType] || item.nextBestActionType}:
                      </strong>{" "}
                      {item.nextBestAction}
                    </span>
                  </div>
                  {item.dueAt ? (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {item.overdueHours > 0
                        ? `${item.overdueHours} saat gecikmiş`
                        : formatDateTime(item.dueAt)}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-foreground self-end md:self-center shrink-0">
                <Flame className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>{item.rankScore} puan</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs sm:text-sm text-muted-foreground">
          Bugün için önceliklendirilmiş açık satış aksiyonu bulunmuyor.
        </div>
      )}

      <div className="mt-3.5 pt-2 border-t border-border flex justify-end">
        <Link
          href="/follow-ups"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Tüm takip kuyruğunu aç <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </SectionCard>
  );
}
