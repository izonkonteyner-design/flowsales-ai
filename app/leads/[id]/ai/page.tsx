import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/shared/empty-state";

import { runLeadAiAction } from "./actions";

export const metadata: Metadata = {
  title: "Aday YZ Paneli | FlowSales AI",
};

type PageProps = {
  params: Promise<{ id?: string; leadId?: string }>;
  searchParams: Promise<{ toast?: string; tone?: string }>;
};

const capabilities = [
  { key: "lead_scoring", title: "Aday Puanlama", description: "Aday kalitesini, kanıtları ve satışa hazırlık durumunu değerlendirir." },
  { key: "next_best_action", title: "Sonraki En İyi Aksiyon", description: "En güvenli ve en faydalı sonraki satış adımını önerir." },
  { key: "follow_up_draft", title: "Takip Taslağı", description: "Otomatik göndermeden, bağlama uygun bir taslak oluşturur." },
  { key: "product_recommendation", title: "Ürün Önerisi", description: "Adayı yalnızca aktif katalog ürünleriyle eşleştirir." },
  { key: "quote_recommendation", title: "Teklif Önerisi", description: "Onay için güvenilir kaynaklı bir teklif yapısı önerir." },
] as const;

const runLabels: Record<string, string> = {
  lead_scoring: "Aday Puanlama",
  next_best_action: "Sonraki En İyi Aksiyon",
  follow_up_draft: "Takip Taslağı",
  product_recommendation: "Ürün Önerisi",
  quote_recommendation: "Teklif Önerisi",
  pending: "Beklemede",
  completed: "Tamamlandı",
  failed: "Başarısız",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

function label(value: string) {
  return runLabels[value] ?? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default async function LeadAiPage({ params, searchParams }: PageProps) {
  const [resolvedParams, query] = await Promise.all([params, searchParams]);
  const leadId = resolvedParams.id || resolvedParams.leadId || "";
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const [{ data: lead }, { data: runs, error: runsError }, { data: demoFlag }] = await Promise.all([
    client
      .from("leads")
      .select("id, full_name, company, status, source, estimated_value, currency")
      .eq("organization_id", membership.organization_id)
      .eq("id", leadId)
      .maybeSingle(),
    client
      .from("ai_runs")
      .select("id, capability, status, decision, output, provider, model, created_at, completed_at, error_code")
      .eq("organization_id", membership.organization_id)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
    client.rpc("is_demo_organization", { p_organization_id: membership.organization_id }),
  ]);

  if (!lead) notFound();
  if (runsError) throw new Error(`Unable to load lead AI history: ${runsError.message}`);
  const isDemo = demoFlag === true;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Aday Zekâsı</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{lead.full_name}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {lead.company || "Şirket yok"} · {label(lead.status)} · {lead.source || "Kaynak bilinmiyor"}
          </p>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/leads" className="text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:text-white">Tüm adaylar</Link>
          <Link href="/ai-history" className="text-violet-700 hover:text-violet-900">YZ geçmişi</Link>
        </div>
      </div>

      {query.toast ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${query.tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {query.toast}
        </div>
      ) : null}

      {isDemo ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Güvenli Demo Modu aktif. YZ veriyi analiz edebilir, ancak veriyi değiştiren aksiyonlar ve teklif işlemleri engellenir veya insan onayı gerektirir.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {capabilities.map((capability) => (
          <form key={capability.key} action={runLeadAiAction} className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="capability" value={capability.key} />
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">{capability.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{capability.description}</p>
            <button type="submit" className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-500">
              Analizi Çalıştır
            </button>
          </form>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Son YZ sonuçları</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Yapılandırılmış çıktılar, politika ve onay kontrolleri geçene kadar yalnızca bilgilendirme amaçlıdır.</p>
          </div>
          {lead.estimated_value !== null ? (
            <p className="text-sm font-semibold text-slate-700">{lead.currency} {Number(lead.estimated_value).toLocaleString()}</p>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          {(runs ?? []).length === 0 ? (
            <EmptyState
              title="Henüz YZ analizi çalıştırılmadı"
              description="Bu aday için yukarıdaki yeteneklerden birini çalıştırarak ilk analizi oluşturun."
            />
          ) : (runs ?? []).map((run) => {
            const output = run.output && typeof run.output === "object" ? run.output as { summary?: string; confidence?: number; actions?: Array<{ title?: string; rationale?: string }>; warnings?: string[] } : null;
            return (
              <article key={run.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{label(run.capability)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{label(run.status)}</span>
                  {run.decision ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{label(run.decision)}</span> : null}
                  <span className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString("tr-TR")}</span>
                </div>
                {output?.summary ? <p className="mt-3 text-sm leading-6 text-slate-800">{output.summary}</p> : null}
                {typeof output?.confidence === "number" ? <p className="mt-2 text-xs text-slate-500">Güven: %{Math.round(output.confidence * 100)}</p> : null}
                {output?.actions?.length ? (
                  <ul className="mt-3 space-y-2">
                    {output.actions.map((action, index) => (
                      <li key={`${run.id}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-900">{action.title}</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-400">{action.rationale}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {run.error_code ? <p className="mt-3 text-sm font-medium text-red-700">{run.error_code}</p> : null}
                {run.provider ? <p className="mt-3 text-xs text-slate-500">{run.provider} · {run.model}</p> : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
