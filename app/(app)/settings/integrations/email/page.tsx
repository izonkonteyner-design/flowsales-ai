import type { Metadata } from "next";
import { EmailConnections } from "@/components/email/email-connections";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { isEmailProviderConfigured, listEmailConnections } from "@/server/services/integrations/email-service";

export const metadata: Metadata = { title: "E-posta Entegrasyonları — FlowSales AI" };

export default async function EmailIntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const workspace = await getWorkspaceContext(); const query = await searchParams;
  const connections = workspace.mode === "live" ? await listEmailConnections(workspace.organization.id) : [];
  const canManage = workspace.mode === "live" && (workspace.role === "owner" || workspace.role === "admin");
  return <div className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-3xl font-bold text-slate-950 dark:text-white">E-posta Entegrasyonları</h1><p className="mt-2 text-sm text-slate-500">Gmail ve Microsoft 365 hesaplarınızı güvenli OAuth bağlantısıyla FlowSales’e ekleyin.</p></div>{query.connected ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">E-posta hesabı başarıyla bağlandı.</p> : null}{query.error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{query.error}</p> : null}<EmailConnections connections={connections} canManage={canManage} gmailConfigured={isEmailProviderConfigured("gmail")} microsoftConfigured={isEmailProviderConfigured("microsoft")} /><section className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300"><h2 className="font-semibold text-slate-950 dark:text-white">Güvenlik ve kapsam</h2><p className="mt-2">FlowSales yalnızca e-postaları okumak ve sizin başlattığınız mesajları göndermek için yetki ister. Erişim anahtarları AES-256-GCM ile şifrelenir; bağlantıyı bu ekrandan istediğiniz zaman kaldırabilirsiniz.</p></section></div>;
}
