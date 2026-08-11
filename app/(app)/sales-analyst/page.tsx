import { getWorkspaceContext } from "@/server/services/workspace-context";
import { answerSalesAnalystQuestion } from "@/server/services/sales-operations-v5";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SalesAnalystPage({ searchParams }: Props) {
  const params = await searchParams;
  const question = typeof params.q === "string" ? params.q : "";
  const context = await getWorkspaceContext();
  const result = question && context.mode === "live" ? await answerSalesAnalystQuestion(context.organization.id, question) : null;
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">AI Satış Analisti</h1><p className="mt-2 text-slate-500">Yanıtlar yalnızca çalışma alanındaki gerçek CRM, teklif ve callback verilerinden üretilir.</p></div>
    <form className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-4"><input name="q" defaultValue={question} placeholder="Örn. Risk altındaki gelir ne kadar?" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Analiz et</button></form>
    {result && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-sm font-medium text-blue-600">{result.title}</div><p className="mt-2 text-lg font-semibold text-slate-900">{result.answer}</p><details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Dayanak veriyi göster</summary><pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(result.evidence, null, 2)}</pre></details></section>}
    {!result && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">“Bugün kimi aramalıyım?”, “Risk altındaki gelir ne kadar?”, “Tekliflerde durum ne?” gibi bir soru yazın.</div>}
  </div>;
}
