import { getWorkspaceContext } from "@/server/services/workspace-context";
import { listCallbackQueue } from "@/server/services/sales-operations-v5";
import { completeCallbackAction, createCallbackAction } from "../actions";

export default async function CallbackQueuePage() {
  const context = await getWorkspaceContext();
  const rows = context.mode === "live" && context.userId ? await listCallbackQueue(context.organization.id, context.userId, context.role) : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Callback Kuyruğu</h1><p className="mt-2 text-slate-500">Geri aranacak lead'leri tarih, sorumlu ve sonuçla yönetin.</p></div>
    <form action={createCallbackAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-4">
      <input name="leadId" required placeholder="Lead UUID" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <input name="scheduledFor" required type="datetime-local" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <input name="reason" placeholder="Geri arama nedeni" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Callback ekle</button>
    </form>
    <div className="space-y-3">{rows.map((row: any) => <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><div className="font-semibold text-slate-900">{row.leads?.full_name || row.lead_id}</div><div className="text-sm text-slate-500">{row.leads?.phone || ""} · {new Date(row.scheduled_for).toLocaleString("tr-TR")}</div><div className="mt-1 text-sm text-slate-600">{row.reason || "Geri arama"}</div></div><form action={completeCallbackAction} className="flex gap-2"><input type="hidden" name="callbackId" value={row.id}/><input name="outcome" defaultValue="Görüşüldü" className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Tamamla</button></form></div></div>)}{!rows.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Bekleyen callback yok.</div>}</div>
  </div>;
}
