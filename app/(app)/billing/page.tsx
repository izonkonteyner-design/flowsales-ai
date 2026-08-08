import Link from "next/link";
import { CreditCard, Crown, ReceiptText, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getLemonSqueezyBillingConfigStatus } from "@/server/services/lemonsqueezy-billing";

const plans = [
  { key: "starter", name: "Starter", detail: "Küçük ekipler için CRM + temel YZ kullanımı" },
  { key: "growth", name: "Growth", detail: "Büyüyen satış ekipleri ve daha yüksek kullanım limitleri" },
  { key: "pro", name: "Pro", detail: "Yoğun çok kanallı satış ve gelişmiş YZ iş akışları" },
] as const;

export default async function BillingPage() {
  const workspace = await getWorkspaceContext();
  const config = getLemonSqueezyBillingConfigStatus();
  const client = await createSupabaseServerClient();
  const entitlement = client && workspace.mode === "live"
    ? (await client.from("organization_entitlements").select("plan_key,subscription_status,trial_ends_at,seat_limit,monthly_ai_run_limit,billing_subscription_id").eq("organization_id", workspace.organization.id).maybeSingle()).data
    : null;

  const canManage = workspace.mode === "live" && (workspace.role === "owner" || workspace.role === "admin");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ticari" title="Faturalandırma ve Plan" description="Abonelik, plan limitleri ve ödeme yönetimini gerçek çalışma alanı durumuyla yönetin." actions={<StatusBadge tone={config.configured ? "success" : "warning"}>{config.configured ? "Ödeme altyapısı hazır" : "Sağlayıcı yapılandırması gerekli"}</StatusBadge>} />

      <SectionCard title="Mevcut abonelik" description="Plan ve entitlement kayıtları sunucu tarafında uygulanır.">
        <div className="grid gap-4 md:grid-cols-4">
          <Info title="Plan" value={entitlement?.plan_key ?? (workspace.mode === "demo" ? "demo" : "trial")} icon={Crown} />
          <Info title="Durum" value={entitlement?.subscription_status ?? (workspace.mode === "demo" ? "demo" : "trialing")} icon={ShieldCheck} />
          <Info title="Koltuk limiti" value={String(entitlement?.seat_limit ?? 3)} icon={ReceiptText} />
          <Info title="Aylık YZ limiti" value={String(entitlement?.monthly_ai_run_limit ?? 100)} icon={CreditCard} />
        </div>
        {entitlement?.billing_subscription_id && canManage ? <Link href="/api/billing/portal" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-white/[0.1] px-4 text-sm font-semibold text-white hover:bg-white/[0.06]">Aboneliği müşteri portalında yönet</Link> : null}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <SectionCard key={plan.key} title={plan.name} description={plan.detail}>
            <div className="space-y-4 text-sm text-slate-400"><p>Plan geçişleri checkout → webhook → entitlement zinciriyle doğrulanır.</p>{canManage && config.configured ? <Link href={`/api/billing/checkout?plan=${plan.key}`} className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-white px-4 font-semibold text-slate-950">{entitlement?.plan_key === plan.key ? "Mevcut plan" : `${plan.name} planına geç`}</Link> : <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-amber-200">{workspace.mode === "demo" ? "Demo çalışma alanında satın alma kapalıdır." : !canManage ? "Plan değişikliği için Owner/Admin yetkisi gerekir." : "Lemon Squeezy Production env değişkenleri tamamlanmalıdır."}</p>}</div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

function Info({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Crown }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4"><Icon className="h-4 w-4 text-violet-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 font-semibold text-white">{value}</p></div>;
}
