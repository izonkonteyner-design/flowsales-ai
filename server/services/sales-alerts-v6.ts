import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSlaBreaches } from "@/server/services/sales-growth-v6";
import { getRevenueLeakage } from "@/server/services/sales-operations-v5";

async function hasRecentNotification(params: { organizationId: string; userId: string; type: string; href: string }) {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 20 * 60 * 60_000).toISOString();
  const { data } = await admin.from("notifications").select("id").eq("organization_id", params.organizationId).eq("user_id", params.userId).eq("type", params.type).eq("href", params.href).gte("created_at", since).limit(1).maybeSingle();
  return Boolean(data);
}

async function notify(params: { organizationId: string; userId: string; type: string; title: string; body: string; href: string }) {
  if (await hasRecentNotification(params)) return false;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("create_user_notification", {
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_type: params.type,
    p_title: params.title,
    p_body: params.body,
    p_href: params.href,
  });
  if (error) throw new Error(`Satış uyarısı oluşturulamadı: ${error.message}`);
  return true;
}

export async function createSalesHealthAlerts(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: members }, sla, leakage] = await Promise.all([
    admin.from("organization_members").select("user_id,role").eq("organization_id", organizationId),
    getSlaBreaches(organizationId),
    getRevenueLeakage(organizationId),
  ]);
  const managerIds = (members || []).filter((member) => ["owner", "admin"].includes(member.role)).map((member) => member.user_id);
  let created = 0;

  for (const breach of sla.slice(0, 20)) {
    const recipients = breach.assignedTo ? [breach.assignedTo] : managerIds;
    for (const userId of [...new Set(recipients)]) {
      const done = await notify({
        organizationId,
        userId,
        type: "sales_sla_breach",
        title: "Satış SLA süresi aşıldı",
        body: `${breach.name} için ${breach.breachType === "first_response" ? "ilk yanıt" : "takip"} SLA'sı ${breach.overdueMinutes} dakika aşıldı.`,
        href: `/leads/${breach.leadId}`,
      });
      if (done) created += 1;
    }
  }

  const highLeakage = leakage.opportunities.filter((item) => item.risk >= 70).slice(0, 10);
  for (const item of highLeakage) {
    for (const userId of managerIds) {
      const done = await notify({
        organizationId,
        userId,
        type: "revenue_leakage_risk",
        title: "Yüksek gelir kaçağı riski",
        body: `${item.name} fırsatında yaklaşık ${Math.round(item.atRiskValue).toLocaleString("tr-TR")} TL risk altında.`,
        href: `/leads/${item.leadId}`,
      });
      if (done) created += 1;
    }
  }

  return { created, slaBreaches: sla.length, highLeakage: highLeakage.length };
}
