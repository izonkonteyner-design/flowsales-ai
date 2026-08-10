import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export type SalesExecutionPriority = {
  conversationId: string;
  leadId: string | null;
  contactName: string;
  provider: string;
  score: number;
  priority: "high" | "medium" | "low";
  salesStage: string;
  nextBestAction: string;
  nextBestActionType: string;
  nextBestActionRationale: string | null;
  dueAt: string | null;
  overdueHours: number;
  rankScore: number;
  href: string;
};

const PRIORITY_WEIGHT = { high: 25, medium: 10, low: 0 } as const;
const STAGE_WEIGHT: Record<string, number> = {
  negotiation: 25,
  quote_sent: 22,
  quote_ready: 20,
  qualified: 15,
  discovery: 8,
  new_lead: 5,
  support: 0,
  won: -100,
  lost: -100,
};

function overdueHours(value: string | null, now: number) {
  if (!value) return 0;
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 3_600_000));
}

export async function listSalesExecutionPriorities(organizationId: string, limit = 10): Promise<SalesExecutionPriority[]> {
  const admin = createSupabaseAdminClient();
  const { data: qualifications, error } = await admin
    .from("conversation_ai_qualifications")
    .select("id,conversation_id,lead_id,provider,score,priority,sales_stage,next_best_action,next_best_action_type,next_best_action_rationale,recommended_follow_up_at,status,created_at")
    .eq("organization_id", organizationId)
    .in("status", ["suggested", "accepted"])
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw new Error("Satış öncelikleri yüklenemedi.");

  const latestByConversation = new Map<string, (typeof qualifications)[number]>();
  for (const row of qualifications || []) if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
  const rows = [...latestByConversation.values()].filter((row) => !["won", "lost", "support"].includes(row.sales_stage || ""));
  if (!rows.length) return [];

  const conversationIds = rows.map((row) => row.conversation_id);
  const [{ data: conversations }, { data: actions }] = await Promise.all([
    admin.from("conversations").select("id,channel_contact_id,last_message_at,status").eq("organization_id", organizationId).in("id", conversationIds),
    admin.from("sales_follow_up_actions").select("conversation_id,scheduled_for,status").eq("organization_id", organizationId).in("conversation_id", conversationIds).in("status", ["approval_required", "approved"]).order("scheduled_for"),
  ]);
  const conversationMap = new Map((conversations || []).map((row) => [row.id, row]));
  const contactIds = (conversations || []).map((row) => row.channel_contact_id).filter((id): id is string => Boolean(id));
  const { data: contacts } = contactIds.length
    ? await admin.from("channel_contacts").select("id,display_name").eq("organization_id", organizationId).in("id", contactIds)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  const contactMap = new Map((contacts || []).map((row) => [row.id, row.display_name || "İsimsiz müşteri"]));
  const earliestAction = new Map<string, string>();
  for (const action of actions || []) if (!earliestAction.has(action.conversation_id)) earliestAction.set(action.conversation_id, action.scheduled_for);

  const now = Date.now();
  return rows.map((row) => {
    const conversation = conversationMap.get(row.conversation_id);
    const dueAt = earliestAction.get(row.conversation_id) || row.recommended_follow_up_at || null;
    const overdue = overdueHours(dueAt, now);
    const priority = (row.priority || "medium") as "high" | "medium" | "low";
    const rankScore = Math.max(0, row.score || 0)
      + PRIORITY_WEIGHT[priority]
      + (STAGE_WEIGHT[row.sales_stage || "new_lead"] || 0)
      + Math.min(30, overdue * 2)
      + (row.status === "accepted" ? 5 : 0);
    return {
      conversationId: row.conversation_id,
      leadId: row.lead_id,
      contactName: conversation?.channel_contact_id ? contactMap.get(conversation.channel_contact_id) || "İsimsiz müşteri" : "İsimsiz müşteri",
      provider: row.provider,
      score: row.score,
      priority,
      salesStage: row.sales_stage || "new_lead",
      nextBestAction: row.next_best_action,
      nextBestActionType: row.next_best_action_type || "ask_question",
      nextBestActionRationale: row.next_best_action_rationale,
      dueAt,
      overdueHours: overdue,
      rankScore,
      href: `/inbox/${row.conversation_id}`,
    } satisfies SalesExecutionPriority;
  }).sort((a, b) => b.rankScore - a.rankScore || b.score - a.score).slice(0, Math.min(25, Math.max(1, limit)));
}

export async function applyQualificationToLead(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  qualificationId: string;
}) {
  if (params.userRole === "viewer") throw new Error("Salt okunur kullanıcı CRM önerisini uygulayamaz.");
  const admin = createSupabaseAdminClient();
  const { data: qualification } = await admin.from("conversation_ai_qualifications")
    .select("id,lead_id,signals,missing_information,sales_stage,next_best_action,status")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId).eq("id", params.qualificationId).maybeSingle();
  if (!qualification?.lead_id) throw new Error("Bu görüşme bir CRM lead kaydına bağlı değil.");
  if (qualification.status !== "accepted") throw new Error("CRM senkronizasyonundan önce AI analizi insan tarafından kabul edilmelidir.");

  const { data: lead } = await admin.from("leads").select("id,notes,city,next_follow_up_at")
    .eq("organization_id", params.organizationId).eq("id", qualification.lead_id).maybeSingle();
  if (!lead) throw new Error("Lead bulunamadı.");

  const signals = (qualification.signals || {}) as Record<string, unknown>;
  const lines = [
    typeof signals.productInterest === "string" && `Ürün ilgisi: ${signals.productInterest}`,
    typeof signals.location === "string" && `Lokasyon: ${signals.location}`,
    typeof signals.budget === "string" && `Bütçe: ${signals.budget}`,
    typeof signals.timeline === "string" && `Zamanlama: ${signals.timeline}`,
    typeof signals.useCase === "string" && `Kullanım amacı: ${signals.useCase}`,
    `AI sonraki aksiyon: ${qualification.next_best_action}`,
  ].filter(Boolean) as string[];
  const block = `[AI Conversation Intelligence 2.0]\n${lines.join("\n")}`;
  const currentNotes = lead.notes?.trim() || "";
  const notes = currentNotes.includes(block) ? currentNotes : [currentNotes, block].filter(Boolean).join("\n\n");
  const city = !lead.city && typeof signals.location === "string" ? signals.location.slice(0, 120) : lead.city;

  const { error } = await admin.from("leads").update({ notes, city, updated_at: new Date().toISOString() })
    .eq("organization_id", params.organizationId).eq("id", qualification.lead_id);
  if (error) throw new Error("CRM önerileri lead kaydına uygulanamadı.");

  await admin.from("omnichannel_audit_events").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    actor_user_id: params.userId,
    event_type: "ai_crm_suggestion_applied",
    metadata: { qualification_id: qualification.id, lead_id: qualification.lead_id, fields: ["notes", ...(city !== lead.city ? ["city"] : [])] },
  });
  return { leadId: qualification.lead_id, appliedFields: ["notes", ...(city !== lead.city ? ["city"] : [])] };
}
