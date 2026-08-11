import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSequenceAction, enrollSequenceAction } from "../actions";

export default async function SequencesPage() {
  const context = await getWorkspaceContext();
  const admin = createSupabaseAdminClient();
  const templates = context.mode === "live" ? (await admin.from("sales_sequence_templates").select("id,name,description,active,created_at").eq("organization_id", context.organization.id).order("created_at", { ascending: false }).limit(50)).data || [] : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Takip Dizileri</h1><p className="mt-2 text-slate-500">Takip adımları otomatik hazırlanır; müşteriyle temas gerektiren her adım insan onayı ister.</p></div>
    <form action={createSequenceAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_2fr_auto]"><input name="name" required placeholder="Dizi adı" className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input name="description" placeholder="Açıklama" className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">3 adımlı dizi oluştur</button></form>
    <div className="grid gap-4 lg:grid-cols-2">{templates.map((template) => <section key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">{template.name}</h2><p className="mt-1 text-sm text-slate-500">{template.description || "Standart insan onaylı takip dizisi"}</p><form action={enrollSequenceAction} className="mt-4 flex gap-2"><input type="hidden" name="templateId" value={template.id}/><input name="leadId" required placeholder="Lead UUID" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">Lead ekle</button></form></section>)}{!templates.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">Henüz takip dizisi yok.</div>}</div>
  </div>;
}
