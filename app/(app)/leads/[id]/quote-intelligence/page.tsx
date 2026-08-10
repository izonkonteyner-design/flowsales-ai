import Link from "next/link";
import { ArrowLeft, FileText, MessageSquareText, ShieldCheck, Target } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { formatCurrency } from "@/lib/utils";
import { getQuoteIntelligence } from "@/server/services/revenue-intelligence-v4";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

const stageLabels: Record<string,string> = { new_lead:"Yeni lead", discovery:"İhtiyaç analizi", qualified:"Nitelikli", quote_ready:"Teklife hazır", quote_sent:"Teklif gönderildi", negotiation:"Pazarlık" };

export default async function QuoteIntelligencePage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) return <EmptyState title="Oturum gerekli" description="Teklif zekâsını görmek için giriş yapın." actionHref="/login" actionLabel="Giriş yap" />;
  const data = await getQuoteIntelligence({organizationId:ctx.organization.id,userId:ctx.userId,userRole:ctx.role},id);
  if (!data) return <EmptyState title="Lead bulunamadı" description="Bu kayıt mevcut çalışma alanında bulunmuyor veya erişim sınırınızın dışında." actionHref="/leads" actionLabel="Lead listesine dön" />;
  const createQuoteHref = `/quotes/new?lead_id=${encodeURIComponent(id)}`;
  return <div className="space-y-6">
    <PageHeader eyebrow="Quote Intelligence" title={`${data.lead.full_name} için teklif hazırlığı`} description="Conversation Intelligence ve CRM bağlamını teklif öncesi kontrol listesine dönüştürür. Fiyat ve ticari koşullar kullanıcı onayı olmadan oluşturulmaz." actions={<Link href={`/leads/${id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-slate-300"><ArrowLeft className="h-4 w-4"/>Lead’e dön</Link>} />
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Lead Score" value={String(data.score)} /><Metric label="Satış aşaması" value={stageLabels[data.salesStage] || data.salesStage} /><Metric label="Tahmini değer" value={formatCurrency(Number(data.lead.estimated_value||0),data.lead.currency||"TRY")} /><Metric label="Teklif hazırlığı" value={data.readiness === "ready" ? "Hazır" : "İnceleme gerekli"} /></div>
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Teklif girdileri" description="AI tarafından konuşma ve CRM verilerinden güvenli şekilde çıkarılan bağlam.">
        <dl className="space-y-3 text-sm"><Row label="Ürün / hizmet" value={data.productInterest || "Netleşmedi"}/><Row label="Lokasyon" value={data.location || "Netleşmedi"}/><Row label="Bütçe" value={data.budget || "Netleşmedi"}/><Row label="Zamanlama" value={data.timeline || "Netleşmedi"}/><Row label="Sonraki en iyi aksiyon" value={data.nextBestAction}/></dl>
      </SectionCard>
      <SectionCard title="Ticari güvenlik kontrolü" description="Eksik veya riskli bilgi teklif öncesinde görünür hale getirilir.">
        <div className="space-y-3">{data.warnings.length ? data.warnings.map((warning)=><div key={warning} className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>{warning}</div>) : <div className="flex gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>Temel teklif bağlamı yeterli görünüyor.</div>}
        {data.objections.length ? <div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">İtiraz / risk</p>{data.objections.map((item)=><p key={item} className="mb-1 text-sm text-slate-300">• {item}</p>)}</div> : null}
        {data.missingInformation.length ? <div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Eksik bilgi</p>{data.missingInformation.map((item)=><p key={item} className="mb-1 text-sm text-slate-300">• {item}</p>)}</div> : null}
        </div>
      </SectionCard>
    </div>
    <SectionCard title="Kontrollü sonraki adım" description="Teklif formu lead bağlamıyla açılır; ürün, fiyat, indirim, vergi, nakliye ve ödeme koşulları kullanıcı tarafından doğrulanır.">
      <div className="flex flex-wrap gap-3"><Link href={createQuoteHref} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"><FileText className="h-4 w-4"/>Teklif oluştur</Link>{data.conversationId ? <Link href={`/inbox/${data.conversationId}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-slate-300"><MessageSquareText className="h-4 w-4"/>Görüşmeyi aç</Link> : null}<Link href={`/leads/${id}/score-history`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-slate-300"><Target className="h-4 w-4"/>Skor geçmişi</Link></div>
    </SectionCard>
  </div>;
}
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 font-semibold text-white">{value}</p></div>; }
function Row({label,value}:{label:string;value:string}) { return <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-white/5 pb-3"><dt className="text-slate-500">{label}</dt><dd className="text-slate-200">{value}</dd></div>; }
