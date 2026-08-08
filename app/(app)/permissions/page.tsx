import Link from "next/link";
import { Lock, ShieldCheck, UsersRound } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { organizationPermissionSchema, organizationRoleSchema, roleHasPermission } from "@/server/services/commercial-access";

const permissionLabels: Record<string, string> = {
  manage_members: "Ekip ve üyeleri yönet",
  manage_billing: "Faturalandırmayı yönet",
  manage_workspace: "Çalışma alanı ayarlarını yönet",
  review_ai: "YZ aksiyonlarını incele/onayla",
  manage_pipeline: "Satış hunisini yönet",
  run_ai: "YZ çalıştır",
  import_data: "Veri içe aktar",
  edit_crm: "CRM verisini düzenle",
  view_crm: "CRM verisini görüntüle",
};

export default async function PermissionsPage() {
  const workspace = await getWorkspaceContext();
  const parsedRole = organizationRoleSchema.safeParse(workspace.role);
  const role = parsedRole.success ? parsedRole.data : "viewer";
  const canManageMembers = roleHasPermission(role, "manage_members");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Güvenlik" title="Yetkiler ve Roller" description="Aktif rolünüzün sunucu tarafında uygulanan yetkilerini görün; ekip rollerini gerçek üye yönetimi ekranından yönetin." actions={<StatusBadge tone={canManageMembers ? "success" : "neutral"}>{role}</StatusBadge>} />

      <SectionCard title="Aktif rol yetkileri" description="Bu liste commercial-access yetki matrisiyle aynı kaynağı kullanır.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {organizationPermissionSchema.options.map((permission) => {
            const allowed = roleHasPermission(role, permission);
            return <div key={permission} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-white">{permissionLabels[permission]}</span>{allowed ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <Lock className="h-4 w-4 text-slate-600" />}</div><p className="mt-2 text-xs text-slate-500">{allowed ? "İzin verildi" : "Bu rol için kapalı"}</p></div>;
          })}
        </div>
      </SectionCard>

      <SectionCard title="Ekip rol yönetimi" description="Üye daveti, rol güncelleme ve erişim kaldırma gerçek workspace member aksiyonlarıyla yapılır.">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-violet-300" /><div><p className="font-medium text-white">Çalışma alanı üyeleri</p><p className="text-sm text-slate-500">Rol değişiklikleri tenant kapsamlı server action’larla doğrulanır.</p></div></div>{canManageMembers ? <Link href="/settings/members" className="inline-flex h-10 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-950">Üyeleri ve rolleri yönet</Link> : <span className="text-sm text-slate-500">Yönetim için Owner/Admin yetkisi gerekir.</span>}</div>
      </SectionCard>
    </div>
  );
}
