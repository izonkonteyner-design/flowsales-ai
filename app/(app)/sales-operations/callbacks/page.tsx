import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { listCallbackQueue } from "@/server/services/sales-operations-v5";
import { completeCallbackAction, createCallbackAction } from "../actions";

export default async function CallbackQueuePage() {
  const context = await getWorkspaceContext();
  const canWrite = context.mode === "live" && Boolean(context.userId) && context.role !== "viewer";
  const rows = context.mode === "live" && context.userId
    ? await listCallbackQueue(context.organization.id, context.userId, context.role)
    : [];

  let leadOptions: Array<{ id: string; full_name: string; phone: string | null; status: string }> = [];
  if (canWrite) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("leads")
      .select("id,full_name,phone,status")
      .eq("organization_id", context.organization.id)
      .not("status", "in", "(won,lost)")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (!error) leadOptions = data || [];
  }

  return <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-slate-900">Callback Kuyruğu</h1>
      <p className="mt-2 text-slate-500">Geri aranacak lead kayıtlarını tarih, sorumlu ve sonuçla yönetin.</p>
    </div>

    {canWrite ? <form action={createCallbackAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-4">
      <select name="leadId" required defaultValue="" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="" disabled>Lead seçin</option>
        {leadOptions.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name}{lead.phone ? ` · ${lead.phone}` : ""} · {lead.status}</option>)}
      </select>
      <input name="scheduledFor" required type="datetime-local" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <input name="reason" placeholder="Geri arama nedeni" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Callback ekle</button>
      {!leadOptions.length ? <p className="text-xs text-amber-700 md:col-span-4">Callback oluşturmak için aktif bir lead kaydı bulunamadı.</p> : null}
    </form> : <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Callback oluşturmak için yazma yetkisi olan canlı bir çalışma alanı gerekir.</div>}

    <div className="space-y-3">{rows.map((row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      return <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <div className="font-semibold text-slate-900">{lead?.full_name || row.lead_id}</div>
            <div className="text-sm text-slate-500">{lead?.phone || ""} · {new Date(row.scheduled_for).toLocaleString("tr-TR")}</div>
            <div className="mt-1 text-sm text-slate-600">{row.reason || "Geri arama"}</div>
          </div>
          {canWrite ? <form action={completeCallbackAction} className="flex gap-2">
            <input type="hidden" name="callbackId" value={row.id} />
            <input name="outcome" defaultValue="Görüşüldü" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Tamamla</button>
          </form> : null}
        </div>
      </div>;
    })}{!rows.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Bekleyen callback yok.</div>}</div>
  </div>;
}