import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { applyLeadScoreDecay, getLeadIntentHistory } from "@/server/services/sales-operations-v5";
import { calculateLeadCompleteness, checkDeliveryRegionFit, getProductFitRecommendations, suggestLeadRouting } from "@/server/services/sales-growth-v6";

type Props = { params: Promise<{ id: string }> };

export default async function LeadIntelligencePage({ params }: Props) {
  const { id } = await params;
  const context = await getWorkspaceContext();
  const admin = createSupabaseAdminClient();
  if (context.mode !== "live") return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">Lead Intelligence canlı çalışma alanında kullanılabilir.</div>;
  const { data: lead } = await admin.from("leads").select("id,full_name,email,phone,city,company,estimated_value,next_follow_up_at,assigned_to,status,updated_at").eq("organization_id", context.organization.id).eq("id", id).maybeSingle();
  if (!lead) return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">Lead bulunamadı.</div>;
  const [history, products, delivery, routing] = await Promise.all([
    getLeadIntentHistory(context.organization.id, id),
    getProductFitRecommendations(context.organization.id, id),
    checkDeliveryRegionFit(context.organization.id, id),
    suggestLeadRouting(context.organization.id, id),
  ]);
  const completeness = calculateLeadCompleteness(lead);
  const latest = history.at(-1) || null;
  const decayedScore = latest ? applyLeadScoreDecay(Number(latest.score), lead.updated_at, lead.status) : null;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold text-slate-900">Lead Intelligence · {lead.full_name}</h1><p className="mt-2 text-slate-500">Niyet, skor açıklaması, veri kalitesi, ürün uyumu, bölge uygunluğu ve routing önerisi.</p></div><Link href={`/leads/${id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Lead'e dön</Link></div>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Son niyet skoru" value={latest ? String(latest.score) : "—"}/><Metric label="Decay sonrası" value={decayedScore === null ? "—" : String(decayedScore)}/><Metric label="Veri tamlığı" value={`%${completeness.score}`}/><Metric label="Routing güveni" value={`%${routing.confidence}`}/></div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Niyet ve skor geçmişi">{history.map((point) => <div key={point.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><span className="font-semibold text-slate-900">{point.score}/100 · {point.temperature}</span><span className="text-xs text-slate-500">{new Date(point.created_at).toLocaleString("tr-TR")}</span></div><div className="mt-1 text-sm text-slate-600">{point.reason}</div></div>)}{!history.length && <Empty text="Henüz niyet geçmişi yok."/>}</Panel>
      <Panel title="Ürün uyumu">{products.map((product) => <Link key={product.productId} href={`/products/${product.productId}`} className="block rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><span className="font-medium text-slate-900">{product.name}</span><span className="text-sm font-semibold text-blue-600">Uyum {product.score}</span></div><div className="text-sm text-slate-500">{product.price.toLocaleString("tr-TR")} TL</div></Link>)}{!products.length && <Empty text="Uygun ürün bulunamadı."/>}</Panel>
      <Panel title="Bölge ve routing"><div className="space-y-3 text-sm"><Row label="Teslimat bölgesi" value={delivery.supported === null ? "Doğrulanamıyor" : delivery.supported ? "Uyumlu" : "İnsan doğrulaması gerekli"}/><p className="text-slate-500">{delivery.reason}</p><Row label="Önerilen temsilci" value={routing.userId || "Atama önerisi yok"}/><p className="text-slate-500">{routing.reason}</p></div></Panel>
      <Panel title="Veri kalitesi"><Row label="Tamlık" value={`%${completeness.score}`}/><div className="mt-3 text-sm text-slate-500">Eksik alanlar: {completeness.missing.join(", ") || "yok"}</div></Panel>
    </div>
  </div>;
}

function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div></div>; }
function Panel({title,children}:{title:string;children:React.ReactNode}) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">{title}</h2><div className="space-y-3">{children}</div></section>; }
function Row({label,value}:{label:string;value:string}) { return <div className="flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>; }
function Empty({text}:{text:string}) { return <p className="text-sm text-slate-500">{text}</p>; }
