import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bot, ChartNoAxesCombined, CopyCheck, GitMerge, Trophy } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import { getSalesForecast, getWinLossIntelligence, listFollowUpAutomationV2, listIdentityResolutionCandidates } from "@/server/services/revenue-intelligence-v4";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string, string> = { new_lead: "Yeni lead", discovery: "İhtiyaç analizi", qualified: "Nitelikli", quote_ready: "Teklife hazır", quote_sent: "Teklif gönderildi", negotiation: "Pazarlık" };

export default async function RevenueIntelligencePage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Gelir zekâsı merkezini görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;
  const scope = { organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role };
  try {
    const [followUps, forecast, winLoss, duplicates] = await Promise.all([
      listFollowUpAutomationV2(scope),
      getSalesForecast(scope),
      getWinLossIntelligence(scope),
      listIdentityResolutionCandidates(scope),
    ]);
    return <div className="space-y-6">
      <PageHeader eyebrow="Gelir Zekâsı 4.0" title="Satış otomasyonu ve gelir kontrol merkezi" description="Takip öncelikleri, teklif hazırlığı, kazanma-kaybetme nedenleri, ağırlıklı forecast ve kimlik eşleştirme sinyallerini tek yerde yönetin." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Ağırlıklı forecast" value={formatCurrency(forecast.weightedForecast, "TRY")} />
        <Metric label="Commit" value={formatCurrency(forecast.commit, "TRY")} />
        <Metric label="Upside" value={formatCurrency(forecast.upside, "TRY")} />
        <Metric label="Kazanma oranı" value={`%${winLoss.winRate}`} />
        <Metric label="Tekil kimlik adayı" value={String(duplicates.length)} />
      </div>

      <SectionCard title="AI Follow-up Automation 2.0" description="Risk, satış aşaması ve geciken takip süresine göre sırala. Mesaj otomatik gönderilmez; Copilot taslağı insan incelemesine gider.">
        {followUps.length ? <div className="space-y-3">{followUps.slice(0, 10).map((item) => <div key={item.leadId} className="flex flex-col gap-3 rounded-2xl border border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-white">{item.name}</p><StatusBadge tone={item.urgency === "critical" ? "danger" : item.urgency === "high" ? "warning" : "neutral"}>Risk {item.riskScore}</StatusBadge><StatusBadge tone="info">Score {item.score}</StatusBadge><StatusBadge tone="neutral">{stageLabels[item.salesStage] || item.salesStage}</StatusBadge></div><p className="mt-2 text-sm text-slate-400">{item.reason} · Önerilen aksiyon: {item.nextBestAction}</p><p className="mt-1 text-xs text-slate-500">Önerilen gecikme: {item.recommendedDelayHours === 0 ? "şimdi" : `${item.recommendedDelayHours} saat`}</p></div><Link href={`/inbox/${item.conversationId}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white">Copilot ile takip et<Bot className="h-3.5 w-3.5" /></Link></div>)}</div> : <EmptyState title="Takip otomasyonu için kritik kayıt yok" description="Risk veya gecikmiş takip oluştuğunda burada görünür." />}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Sales Forecasting" description="Satış aşaması ve Lead Score birlikte kullanılarak olasılık ağırlıklı tahmin hesaplanır.">
          <div className="mb-4 grid grid-cols-2 gap-3"><Metric label="Toplam pipeline" value={formatCurrency(forecast.totalPipeline,"TRY")} /><Metric label="Riskli pipeline" value={formatCurrency(forecast.risk,"TRY")} /></div>
          <div className="space-y-2">{forecast.opportunities.slice(0,8).map((row)=><div key={row.leadId} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_auto_auto]"><div><Link href={`/leads/${row.leadId}`} className="font-medium text-white hover:underline">{row.name}</Link><p className="text-xs text-slate-500">{stageLabels[row.stage] || row.stage} · Score {row.score}</p></div><StatusBadge tone={row.probability>=70?"success":row.probability>=40?"warning":"neutral"}>%{row.probability}</StatusBadge><span className="text-sm text-slate-300">{formatCurrency(row.weightedValue,"TRY")}</span></div>)}</div>
        </SectionCard>

        <SectionCard title="Win/Loss Intelligence" description="Kapanan fırsatların kazanma oranını ve kayıp itirazlarını görünür kılar.">
          <div className="grid grid-cols-2 gap-3"><Metric label="Kazanılan" value={`${winLoss.wins} · ${formatCurrency(winLoss.wonValue,"TRY")}`} /><Metric label="Kaybedilen" value={`${winLoss.losses} · ${formatCurrency(winLoss.lostValue,"TRY")}`} /></div>
          <div className="mt-4 space-y-2">{winLoss.topLossReasons.length ? winLoss.topLossReasons.map((reason)=><div key={reason.reason} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2"><span className="text-sm text-slate-300">{reason.reason}</span><StatusBadge tone="danger">{reason.count}</StatusBadge></div>) : <p className="text-sm text-slate-500">Henüz sınıflandırılmış kayıp nedeni yok.</p>}</div>
        </SectionCard>
      </div>

      <SectionCard title="Lead Deduplication & Identity Resolution" description="Aynı e-posta veya telefonla eşleşen kayıtları bulur. Birleştirme otomatik yapılmaz; insan incelemesi gerekir.">
        {duplicates.length ? <div className="space-y-2">{duplicates.slice(0,20).map((row,index)=><div key={`${row.type}-${row.primary.id}-${row.duplicate.id}-${index}`} className="grid gap-3 rounded-xl border border-white/10 p-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center"><Link href={`/leads/${row.primary.id}`} className="text-sm font-medium text-white hover:underline">{row.primary.name}</Link><GitMerge className="h-4 w-4 text-amber-300" /><span className="text-sm text-slate-300">{row.duplicate.name}</span><div className="flex items-center gap-2"><StatusBadge tone="warning">Kesin eşleşme</StatusBadge><span className="text-xs text-slate-500">{row.reason}</span></div></div>)}</div> : <EmptyState title="Kesin duplicate bulunmadı" description="Aynı normalize e-posta veya telefonla eşleşen kayıt yok." />}
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3"><Action href="/opportunities/risk" icon={AlertTriangle} label="Riskli fırsatlar" /><Action href="/follow-ups" icon={CopyCheck} label="Takip kuyruğu" /><Action href="/dashboard" icon={ChartNoAxesCombined} label="Kontrol paneli" /></div>
    </div>;
  } catch {
    return <EmptyState title="Gelir zekâsı yüklenemedi" description="Satış otomasyonu verileri şu anda hesaplanamıyor." actionHref="/dashboard" actionLabel="Kontrol paneline dön" />;
  }
}

function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>; }
function Action({href,icon:Icon,label}:{href:string;icon:typeof Trophy;label:string}) { return <Link href={href} className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-medium text-white hover:bg-white/[0.07]">{label}<ArrowUpRight className="h-4 w-4" /></Link>; }
