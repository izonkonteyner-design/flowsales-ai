import Link from "next/link";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { searchSalesEntities } from "@/server/services/global-command-v5";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CommandCenterPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const context = await getWorkspaceContext();
  const results = query && context.mode === "live" ? await searchSalesEntities(context.organization.id, query) : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Komuta Merkezi</h1><p className="mt-2 text-slate-500">Lead, müşteri, teklif ve telefon görüşmelerini tek aramadan açın.</p></div>
    <form className="rounded-2xl border border-slate-200 bg-white p-4"><input autoFocus name="q" defaultValue={query} placeholder="İsim, telefon veya teklif numarası ara…" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"/></form>
    <div className="space-y-2">{results.map((item) => <Link key={`${item.type}-${item.id}`} href={item.href} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300"><div><div className="font-medium text-slate-900">{item.label}</div><div className="text-sm text-slate-500">{item.meta}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase text-slate-600">{item.type}</span></Link>)}{query.length >= 2 && !results.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Sonuç bulunamadı.</div>}</div>
  </div>;
}
