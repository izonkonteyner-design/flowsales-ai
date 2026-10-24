import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { canWriteSalesRecords } from "@/lib/workspace-roles";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSequenceAction, enrollSequenceAction } from "../actions";

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

export default async function SequencesPage() {
  const context = await getWorkspaceContext();
  const canWrite = context.mode === "live" && Boolean(context.userId) && context.organization.id !== DEMO_ORGANIZATION_ID && canWriteSalesRecords(context.role);
  const admin = createSupabaseAdminClient();
  const templates = context.mode === "live" ? (await admin.from("sales_sequence_templates").select("id,name,description,active,created_at").eq("organization_id", context.organization.id).order("created_at", { ascending: false }).limit(50)).data || [] : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900 dark:text-white">Takip Dizileri</h1><p className="mt-2 text-slate-500 dark:text-slate-400">Takip adımları otomatik hazırlanır; müşteriyle temas gerektiren her adım insan onayı ister.</p></div>
    {canWrite ? (
      <form action={createSequenceAction} className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 p-5 text-slate-900 md:grid-cols-[1fr_2fr_auto]"><input name="name" required placeholder="Dizi adı" className="rounded-lg border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 px-3 py-2 text-sm text-slate-900"/><input name="description" placeholder="Açıklama" className="rounded-lg border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 px-3 py-2 text-sm text-slate-900"/><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-500">3 adımlı dizi oluştur</button></form>
    ) : (
      <div className="rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 p-5 text-sm text-slate-500 dark:text-slate-400">Takip dizisi oluşturmak veya lead kaydetmek için yazma yetkisi olan canlı bir çalışma alanı gerekir.</div>
    )}
    <div className="grid gap-4 lg:grid-cols-2">{templates.map((template) => <section key={template.id} className="rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 p-5 text-slate-900 shadow-sm"><h2 className="font-semibold text-slate-900 dark:text-white">{template.name}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{template.description || "Standart insan onaylı takip dizisi"}</p>{canWrite ? <form action={enrollSequenceAction} className="mt-4 flex gap-2"><input type="hidden" name="templateId" value={template.id}/><input name="leadId" required placeholder="Lead UUID" className="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/80 px-3 py-2 text-sm text-slate-900"/><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 dark:text-white">Lead ekle</button></form> : null}</section>)}{!templates.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500 dark:text-slate-400">Henüz takip dizisi yok.</div>}</div>
  </div>;
}
