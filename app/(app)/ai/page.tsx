import Link from "next/link";
import { Bot, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiModel, hasGeminiConfig } from "@/server/services/ai";

const capabilities = ["Potansiyel müşteri puanlama", "Sonraki en iyi aksiyon", "Fırsat özeti", "Takip mesajı taslağı", "Ürün önerisi", "Teklif önerisi"] as const;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AIPage({ searchParams }: Props) {
  const [client, params] = await Promise.all([createSupabaseServerClient(), searchParams]);
  if (!client) redirect("/login");
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) redirect("/login");
  const { data: membership } = await client.from("organization_members").select("organization_id,role").eq("user_id", authData.user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  const [{ data: leads, error: leadsError }, { data: demoFlag }] = await Promise.all([
    client.from("leads").select("id, full_name, company, status, source, updated_at").eq("organization_id", membership.organization_id).order("updated_at", { ascending: false }).limit(25),
    client.rpc("is_demo_organization", { p_organization_id: membership.organization_id }),
  ]);
  if (leadsError) throw new Error(`YZ fırsat verileri yüklenemedi: ${leadsError.message}`);
  const isDemo = demoFlag === true;
  const aiConfigured = hasGeminiConfig();
  const model = getGeminiModel();
  const canTest = !isDemo && (membership.role === "owner" || membership.role === "admin");
  const toast = typeof params.toast === "string" ? params.toast : "";
  const danger = params.tone === "danger";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Asistan" title="YZ satış çalışma alanı" description="Bir fırsat seçin ve çalışma alanı bağlamı, denetim geçmişi ve insan onayıyla production YZ akışını çalıştırın." actions={<div className="flex flex-wrap gap-2"><StatusBadge tone={aiConfigured ? "success" : "warning"}>{aiConfigured ? "YZ anahtarı yapılandırıldı" : "YZ anahtarı eksik"}</StatusBadge><StatusBadge tone={isDemo ? "warning" : "info"}>{isDemo ? "Güvenli demo modu" : "Canlı çalışma alanı"}</StatusBadge></div>} />
      {toast ? <div className={`rounded-2xl border p-4 text-sm ${danger ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"}`}>{toast}</div> : null}
      <section className="relative overflow-hidden rounded-[2rem] border border-violet-400/15 bg-[linear-gradient(135deg,rgba(124,58,237,.16),rgba(37,99,235,.08)_48%,rgba(14,165,233,.06))] p-6 sm:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/10 px-3 py-1.5 text-xs font-medium text-violet-200"><Sparkles className="h-3.5 w-3.5" /> Production YZ iş akışı</div><h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">YZ aksiyonları doğrulanmış potansiyel müşteri bağlamından çalışır.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Aktif model: <span className="font-mono text-slate-300">{model}</span>. Fırsatı puanlayın, takip taslağı üretin, ürün önerisi alın veya onay kontrollü teklif önerisi hazırlayın.</p></div><div className="flex flex-col gap-2"><Link href="/ai-history" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-medium text-white">YZ geçmişini görüntüle <ChevronRight className="h-4 w-4" /></Link>{canTest ? <form action="/api/ai/production-test" method="post"><button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-violet-500 px-4 text-sm font-medium text-white">Production YZ bağlantısını test et</button></form> : null}</div></div>
      </section>
      {!aiConfigured ? <SectionCard className="border-rose-400/20 bg-rose-400/[0.06]"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" /><div><p className="font-medium text-rose-100">Gemini production anahtarı bulunamadı</p><p className="mt-1 text-sm leading-6 text-rose-100/70">Vercel Production ortamında GEMINI_API_KEY tanımlanana kadar canlı YZ üretimi çalışmaz. Anahtar değeri uygulama ekranına veya loglara yazılmaz.</p></div></div></SectionCard> : null}
      {isDemo ? <SectionCard className="border-amber-400/20 bg-amber-400/[0.06]"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><p className="font-medium text-amber-100">Güvenli Demo Modu aktif</p><p className="mt-1 text-sm leading-6 text-amber-100/70">Bilgilendirici YZ analizi kullanılabilir. Veri değiştiren aksiyonlar engellenir veya insan onayı gerektirir.</p></div></div></SectionCard> : null}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <SectionCard title="Fırsat seçin" description="Belirli bir potansiyel müşteri için canlı YZ panelini açın.">{leads?.length ? <div className="grid gap-3 md:grid-cols-2">{leads.map((lead) => <Link key={lead.id} href={`/leads/${lead.id}/ai`} className="group rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-violet-300/25 hover:bg-white/[0.06]"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate font-medium text-white">{lead.full_name}</p><p className="mt-1 truncate text-sm text-slate-500">{lead.company || "Şirket bilgisi yok"}</p></div><Bot className="h-5 w-5 text-violet-300" /></div><div className="mt-4 flex items-center justify-between"><div className="flex gap-2"><StatusBadge tone="neutral">{statusLabel(lead.status)}</StatusBadge>{lead.source ? <StatusBadge tone="info">{lead.source}</StatusBadge> : null}</div><ChevronRight className="h-4 w-4 text-slate-600" /></div></Link>)}</div> : <EmptyState title="YZ için fırsat bulunamadı" description="Önce potansiyel müşteri oluşturun veya içe aktarın." actionHref="/leads/new" actionLabel="Potansiyel müşteri oluştur" />}</SectionCard>
        <SectionCard title="Kullanılabilir yetenekler" description="Her yetenek güvenilir çalışma alanı kayıtlarını kullanır."><div className="space-y-3">{capabilities.map((capability) => <div key={capability} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3"><Sparkles className="h-4 w-4 text-violet-300" /><span className="text-sm text-slate-300">{capability}</span></div>)}</div><Link href="/approvals" className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-4 text-sm font-medium text-white">Onay kuyruğunu aç <ChevronRight className="h-4 w-4" /></Link></SectionCard>
      </div>
    </div>
  );
}

function statusLabel(value: string) {
  const labels: Record<string, string> = { new: "Yeni", contacted: "İletişime geçildi", qualified: "Nitelikli", quote_sent: "Teklif gönderildi", negotiation: "Pazarlık", won: "Kazanıldı", lost: "Kaybedildi" };
  return labels[value] ?? value;
}
