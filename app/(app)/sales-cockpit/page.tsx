import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BarChart3, Bot, Phone, Target, Trophy, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import { getManagerSalesCockpit } from "@/server/services/manager-sales-cockpit";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

export default async function SalesCockpitPage() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Satış yönetim kokpitini görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;
  if (ctx.role === "viewer") return <EmptyState title="Yetki gerekli" description="Bu ekran satış operasyonu görünümü gerektirir." actionHref="/dashboard" actionLabel="Kontrol paneline dön" />;

  const data = await getManagerSalesCockpit({ organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role });
  const currency = ctx.organization.currency || "TRY";

  return <div className="space-y-6">
    <PageHeader eyebrow="Manager Sales Cockpit" title="Satış operasyonu kontrol merkezi" description="Pipeline, forecast, kaçan fırsatlar, telefon performansı, kazanma-kaybetme ve temsilci yükünü aynı yönetim görünümünde birleştirir." />

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <Metric label="Açık fırsat" value={String(data.pipeline.totalOpen)} />
      <Metric label="Pipeline" value={formatCurrency(data.pipeline.estimatedValue, currency)} />
      <Metric label="Ağırlıklı forecast" value={formatCurrency(data.forecast.weightedForecast, currency)} />
      <Metric label="Kazanma oranı" value={`%${data.winLoss.winRate}`} />
      <Metric label="Kaçan fırsat" value={String(data.missed.length)} />
      <Metric label="Telefon çağrısı / 30 gün" value={String(data.phone.calls30d)} />
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Bugünün satış riski" description="Yüksek niyetli, gecikmiş veya teklif aşamasında bekleyen fırsatlar.">
        {data.missed.length ? <div className="space-y-2">{data.missed.map((item) => <Link key={item.leadId} href={`/inbox/${item.conversationId}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><div><p className="font-medium text-slate-950 dark:text-white">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.reason}</p></div><div className="flex items-center gap-2"><StatusBadge tone={item.severity === "critical" ? "danger" : "warning"}>Risk {item.riskScore}</StatusBadge><ArrowUpRight className="h-4 w-4 text-slate-400" /></div></Link>)}</div> : <p className="text-sm text-slate-500">Şu anda kritik kaçan fırsat görünmüyor.</p>}
      </SectionCard>

      <SectionCard title="AI Telefon Satış Kanalı" description="Son 30 gündeki telefon operasyonunun satış kalitesi ve aktarım göstergeleri.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Mini label="Tamamlanan" value={String(data.phone.completedCalls)} icon={Phone} /><Mini label="Sıcak çağrı" value={String(data.phone.hotCalls)} icon={Target} /><Mini label="Temsilci aktarımı" value={String(data.phone.handoffs)} icon={UsersRound} /><Mini label="Ortalama skor" value={`${data.phone.averageLeadScore}/100`} icon={Bot} /><Mini label="Ort. süre" value={`${Math.floor(data.phone.averageDurationSeconds / 60)} dk ${data.phone.averageDurationSeconds % 60} sn`} icon={BarChart3} /></div>
        <div className="mt-4 flex gap-2"><Link href="/inbox/phone" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Telefon Inbox</Link><Link href="/settings/integrations/voice" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium dark:border-white/10">Voice ayarları</Link></div>
      </SectionCard>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Forecast yapısı" description="Commit, upside ve risk ayrımı yöneticinin tahmin kalitesini izlemesini sağlar.">
        <div className="grid grid-cols-2 gap-3"><Metric label="Commit" value={formatCurrency(data.forecast.commit, currency)} /><Metric label="Upside" value={formatCurrency(data.forecast.upside, currency)} /><Metric label="Risk" value={formatCurrency(data.forecast.risk, currency)} /><Metric label="Ortalama Lead Score" value={String(data.pipeline.weightedScore)} /></div>
      </SectionCard>
      <SectionCard title="Win/Loss" description="Kapanan fırsatların sonucu ve en sık kayıp nedenleri.">
        <div className="grid grid-cols-2 gap-3"><Metric label="Kazanılan" value={`${data.winLoss.wins} · ${formatCurrency(data.winLoss.wonValue, currency)}`} /><Metric label="Kaybedilen" value={`${data.winLoss.losses} · ${formatCurrency(data.winLoss.lostValue, currency)}`} /></div>
        <div className="mt-4 space-y-2">{data.winLoss.topLossReasons.slice(0, 5).map((reason) => <div key={reason.reason} className="flex justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10"><span>{reason.reason}</span><StatusBadge tone="danger">{reason.count}</StatusBadge></div>)}</div>
      </SectionCard>
    </div>

    <SectionCard title="Temsilci ve iş yükü görünümü" description="Atanmış lead sayısı, açık fırsat, kazanım ve açık pipeline değeri. Bu görünüm performans bağlamı sağlar; tek başına çalışan değerlendirmesi değildir.">
      <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-slate-500 dark:border-white/10"><th className="px-3 py-2">Temsilci</th><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Açık</th><th className="px-3 py-2">Kazanılan</th><th className="px-3 py-2">Pipeline</th></tr></thead><tbody>{data.reps.map((rep) => <tr key={rep.id} className="border-b border-slate-100 dark:border-white/5"><td className="px-3 py-3 font-medium">{rep.name}</td><td className="px-3 py-3">{rep.leadCount}</td><td className="px-3 py-3">{rep.openCount}</td><td className="px-3 py-3">{rep.wonCount}</td><td className="px-3 py-3">{formatCurrency(rep.pipelineValue, currency)}</td></tr>)}</tbody></table></div>
    </SectionCard>

    <div className="grid gap-3 sm:grid-cols-4"><Action href="/opportunities/missed" icon={AlertTriangle} label="Kaçan fırsatlar" /><Action href="/follow-ups" icon={Target} label="Takip kuyruğu" /><Action href="/revenue-intelligence" icon={Trophy} label="Gelir zekâsı" /><Action href="/inbox/phone" icon={Phone} label="Telefon Inbox" /></div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">{value}</p></div>; }
function Mini({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Phone }) { return <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><Icon className="h-4 w-4 text-blue-600" /><p className="mt-2 text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Action({ href, icon: Icon, label }: { href: string; icon: typeof Phone; label: string }) { return <Link href={href} className="inline-flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"><span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span><ArrowUpRight className="h-4 w-4" /></Link>; }
