import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bot, ChartNoAxesCombined, CopyCheck, GitMerge, Trophy } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import {
  getSalesForecast,
  getWinLossIntelligence,
  listFollowUpAutomationV2,
  listIdentityResolutionCandidates,
} from "@/server/services/revenue-intelligence-v4";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = {
  new_lead: "Yeni lead",
  discovery: "İhtiyaç analizi",
  qualified: "Nitelikli",
  quote_ready: "Teklife hazır",
  quote_sent: "Teklif gönderildi",
  negotiation: "Pazarlık",
};

export default async function RevenueIntelligencePage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) {
    return (
      <EmptyState
        title="Oturum gerekli"
        description="Gelir zekâsı merkezini görmek için giriş yapın."
        actionHref="/login"
        actionLabel="Giriş yap"
      />
    );
  }
  const scope = { organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role };
  const [followUps, forecast, winLoss, duplicates] = await Promise.all([
    listFollowUpAutomationV2(scope),
    getSalesForecast(scope),
    getWinLossIntelligence(scope),
    listIdentityResolutionCandidates(scope),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gelir & Satış Zekâsı"
        title="Gelir ve Satış Zekâsı Merkezi"
        description="Takip öncelikleri, ağırlıklı forecast, kazanma/kaybetme dinamikleri ve veri tekilleştirme sinyalleri."
      />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Ağırlıklı Forecast" value={formatCurrency(forecast.weightedForecast, "TRY")} />
        <Metric label="Commit (Kesin)" value={formatCurrency(forecast.commit, "TRY")} />
        <Metric label="Upside (Potansiyel)" value={formatCurrency(forecast.upside, "TRY")} />
        <Metric label="Kazanma oranı" value={`%${winLoss.winRate}`} />
        <Metric label="Tekil Kimlik Adayı" value={String(duplicates.length)} />
      </div>

      <SectionCard
        title="AI Takip Otomasyonu"
        description="Risk, aşama ve gecikme süresine göre sıralı takip kuyruğu. Taslaklar insan kontrolünden geçer. Mesaj otomatik gönderilmez."
      >
        {followUps.length ? (
          <div className="space-y-2.5">
            {followUps.slice(0, 10).map((item) => (
              <div
                key={item.leadId}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-xs text-foreground">{item.name}</p>
                    <StatusBadge
                      tone={
                        item.urgency === "critical"
                          ? "danger"
                          : item.urgency === "high"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      Risk {item.riskScore}
                    </StatusBadge>
                    <StatusBadge tone="info">Skor {item.score}</StatusBadge>
                    <StatusBadge tone="neutral">
                      {stageLabels[item.salesStage] || item.salesStage}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.reason} · Önerilen Aksiyon: <span className="text-foreground font-medium">{item.nextBestAction}</span>
                  </p>
                </div>
                <Link
                  href={`/inbox/${item.conversationId}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors self-end lg:self-center"
                >
                  <span>Copilot ile takip et</span>
                  <Bot className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Takip için kritik kayıt yok"
            description="Riskli veya gecikmiş müşteri adayı oluştuğunda burada listelenir."
          />
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Olasılık Ağırlıklı Satış Tahmini"
          description="Aşama olasılığı ve lead skoruna göre hesaplanan tahmin."
        >
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <Metric label="Toplam Pipeline" value={formatCurrency(forecast.totalPipeline, "TRY")} />
            <Metric label="Riskli Hacim" value={formatCurrency(forecast.risk, "TRY")} />
          </div>
          <div className="space-y-2">
            {forecast.opportunities.slice(0, 8).map((row) => (
              <div
                key={row.leadId}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5 text-xs shadow-xs"
              >
                <div className="min-w-0">
                  <Link
                    href={`/leads/${row.leadId}/quote-intelligence`}
                    className="font-semibold text-foreground hover:underline truncate block"
                  >
                    {row.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {stageLabels[row.stage] || row.stage} · Skor {row.score}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <StatusBadge
                    tone={row.probability >= 70 ? "success" : row.probability >= 40 ? "warning" : "neutral"}
                  >
                    %{row.probability}
                  </StatusBadge>
                  <p className="mt-0.5 font-bold text-foreground">{formatCurrency(row.weightedValue, "TRY")}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Kazanma ve Kaybetme Dinamikleri (Win/Loss Intelligence)"
          description="Kapanan tekliflerin başarı oranları ve müşteri itiraz nedenleri."
        >
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Metric label="Kazanılan" value={`${winLoss.wins} (${formatCurrency(winLoss.wonValue, "TRY")})`} />
            <Metric label="Kaybedilen" value={`${winLoss.losses} (${formatCurrency(winLoss.lostValue, "TRY")})`} />
          </div>
          <div className="space-y-1.5">
            {winLoss.topLossReasons.length ? (
              winLoss.topLossReasons.map((reason) => (
                <div
                  key={reason.reason}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs shadow-xs"
                >
                  <span className="text-foreground font-medium">{reason.reason}</span>
                  <StatusBadge tone="danger">{reason.count} Adet</StatusBadge>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Sınıflandırılmış kayıp nedeni bulunmuyor.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Mükerrer Kayıt ve Kimlik Eşleştirme (Deduplication)"
        description="Aynı e-posta veya telefonla açılmış potansiyel mükerrer kayıtlar. Birleştirme otomatik yapılmaz."
      >
        {duplicates.length ? (
          <div className="space-y-2">
            {duplicates.slice(0, 10).map((row, index) => (
              <div
                key={`${row.type}-${row.primary.id}-${row.duplicate.id}-${index}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-border bg-card p-3 shadow-xs text-xs"
              >
                <div className="flex items-center gap-2">
                  <Link href={`/leads/${row.primary.id}`} className="font-bold text-foreground hover:underline">
                    {row.primary.name}
                  </Link>
                  <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{row.duplicate.name}</span>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <StatusBadge tone="warning">Eşleşme</StatusBadge>
                  <span className="text-[11px] text-muted-foreground">{row.reason}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Mükerrer kayıt bulunmuyor"
            description="Tüm iletişim bilgileri tekil olarak doğrulanmış durumda."
          />
        )}
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <Action href="/opportunities/risk" icon={AlertTriangle} label="Riskli Fırsatlar" />
        <Action href="/follow-ups" icon={CopyCheck} label="Takip Kuyruğu" />
        <Action href="/dashboard" icon={ChartNoAxesCombined} label="Kontrol Paneli" />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate block">
        {label}
      </span>
      <p className="mt-1 text-base sm:text-lg font-bold text-foreground truncate">{value}</p>
    </div>
  );
}

function Action({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Trophy;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border bg-card p-3.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted/40 transition-colors"
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
