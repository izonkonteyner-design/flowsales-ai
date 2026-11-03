import Link from "next/link";
import { ArrowUpRight, BarChart3, Bot, Phone, Target, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import { getManagerSalesCockpit } from "@/server/services/manager-sales-cockpit";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

export default async function SalesCockpitPage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) {
    return (
      <EmptyState
        title="Oturum gerekli"
        description="Satış yönetim kokpitini görmek için giriş yapın."
        actionHref="/login"
        actionLabel="Giriş yap"
      />
    );
  }
  if (ctx.role === "viewer") {
    return (
      <EmptyState
        title="Yetki gerekli"
        description="Bu ekran satış operasyonu görünümü gerektirir."
        actionHref="/dashboard"
        actionLabel="Kontrol paneline dön"
      />
    );
  }

  const data = await getManagerSalesCockpit({
    organizationId: ctx.organization.id,
    userId: ctx.userId,
    userRole: ctx.role,
  });
  const currency = ctx.organization.currency || "TRY";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Yönetici Kokpiti (Manager Sales Cockpit)"
        title="Satış Operasyon Kokpiti"
        description="Pipeline, forecast, kaçan fırsatlar, sesli satış performansı ve temsilci iş yükü tek ekranda."
      />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Açık Fırsat" value={String(data.pipeline.totalOpen)} />
        <Metric label="Toplam Pipeline" value={formatCurrency(data.pipeline.estimatedValue, currency)} />
        <Metric label="Ağırlıklı Forecast" value={formatCurrency(data.forecast.weightedForecast, currency)} />
        <Metric label="Kazanma Oranı" value={`%${data.winLoss.winRate}`} />
        <Metric label="Kaçan Fırsat" value={String(data.missed.length)} />
        <Metric label="Çağrı / 30 Gün" value={String(data.phone.calls30d)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Satış Riski Altındaki Fırsatlar"
          description="Yüksek niyetli, gecikmiş veya teklif aşamasında takılan fırsatlar."
        >
          {data.missed.length ? (
            <div className="space-y-2">
              {data.missed.map((item) => (
                <Link
                  key={item.leadId}
                  href={`/inbox/${item.conversationId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40 shadow-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-foreground truncate">{item.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{item.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge tone={item.severity === "critical" ? "danger" : "warning"}>
                      Risk {item.riskScore}
                    </StatusBadge>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Kritik kaçan fırsat bulunmuyor.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Sesli Satış Kanalı Göstergeleri"
          description="AI Telefon Satış Kanalı göstergeleri: Son 30 gündeki telefon operasyonunun satış kalitesi ve temsilci aktarımları."
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Mini label="Tamamlanan" value={String(data.phone.completedCalls)} icon={Phone} />
            <Mini label="Sıcak Çağrı" value={String(data.phone.hotCalls)} icon={Target} />
            <Mini label="Aktarım" value={String(data.phone.handoffs)} icon={UsersRound} />
            <Mini label="Ortalama Skor" value={`${data.phone.averageLeadScore}/100`} icon={Bot} />
            <Mini
              label="Ortalama Süre"
              value={`${Math.floor(data.phone.averageDurationSeconds / 60)} dk ${
                data.phone.averageDurationSeconds % 60
              } sn`}
              icon={BarChart3}
            />
          </div>
          <div className="mt-3.5 flex gap-2 border-t border-border pt-2.5">
            <Link
              href="/inbox/phone"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              Telefon Gelen Kutusu
            </Link>
            <Link
              href="/settings/integrations/voice"
              className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Sesli Entegrasyon Ayarları
            </Link>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Gelir Tahmini (Forecast) Dağılımı"
          description="Commit, upside ve risk ayrımı yöneticinin tahmin güvenilirliğini gösterir."
        >
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Metric label="Commit (Kesin)" value={formatCurrency(data.forecast.commit, currency)} />
            <Metric label="Upside (Potansiyel)" value={formatCurrency(data.forecast.upside, currency)} />
            <Metric label="Riskli Hacim" value={formatCurrency(data.forecast.risk, currency)} />
            <Metric label="Ortalama Skor" value={String(data.pipeline.weightedScore)} />
          </div>
        </SectionCard>

        <SectionCard
          title="Kazanma / Kaybetme Oranları"
          description="Kapanan fırsatların sonuca ulaşma dağılımı."
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Metric label="Kazanılan Teklif" value={String(data.winLoss.wins)} />
            <Metric label="Kaybedilen Teklif" value={String(data.winLoss.losses)} />
            <Metric label="Kazanılan Tutar" value={formatCurrency(data.winLoss.wonValue, currency)} />
            <Metric label="Genel Başarı" value={`%${data.winLoss.winRate}`} />
          </div>
        </SectionCard>
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

function Mini({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Phone;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="truncate text-[10px] uppercase font-medium">{label}</span>
      </div>
      <p className="mt-1 text-xs font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
