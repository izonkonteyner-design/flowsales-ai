import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { decideAutomationDraftAction } from "../actions";

export default async function AutomationQueuePage() {
  const context = await getWorkspaceContext();
  const admin = createSupabaseAdminClient();
  const drafts = context.mode === "live" ? (await admin.from("sales_automation_drafts").select("id,lead_id,source_type,source_id,action_type,title,payload,scheduled_for,status,created_at").eq("organization_id", context.organization.id).in("status", ["approval_required","approved"]).order("scheduled_for", { ascending: true }).limit(100)).data || [] : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Otomasyon Onay Kuyruğu</h1><p className="mt-2 text-slate-500">AI ve takip dizileri yalnızca taslak üretir; satış aksiyonu insan onayıyla aktive edilir.</p></div>
    <div className="space-y-3">{drafts.map((draft) => <div key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="text-xs font-semibold uppercase tracking-wide text-blue-600">{draft.action_type} · {draft.source_type}</div><div className="mt-1 font-semibold text-slate-900">{draft.title}</div><div className="mt-1 text-sm text-slate-500">{draft.scheduled_for ? new Date(draft.scheduled_for).toLocaleString("tr-TR") : "Tarih yok"} · {draft.status}</div></div>{draft.status === "approval_required" ? <form action={decideAutomationDraftAction} className="flex gap-2"><input type="hidden" name="draftId" value={draft.id}/><button name="decision" value="approved" className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700">Onayla</button><button name="decision" value="cancelled" className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700">İptal</button></form> : <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">Onaylandı</span>}</div></div>)}{!drafts.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Onay bekleyen otomasyon taslağı yok.</div>}</div>
  </div>;
}
