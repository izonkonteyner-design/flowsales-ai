import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export type Customer360Event = {
  id: string;
  kind: "phone" | "activity" | "ai";
  title: string;
  detail: string;
  at: string;
  href?: string;
};

export async function getCustomer360Timeline(input: {
  organizationId: string;
  customerId: string;
  sourceLeadId?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const [voiceResult, activityResult, aiResult] = await Promise.all([
    admin
      .from("voice_calls")
      .select("id,state,summary,lead_score,temperature,next_best_action,started_at,duration_seconds")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", input.customerId)
      .order("started_at", { ascending: false })
      .limit(30),
    input.sourceLeadId
      ? admin
          .from("activities")
          .select("id,type,title,detail,created_at")
          .eq("organization_id", input.organizationId)
          .eq("lead_id", input.sourceLeadId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    input.sourceLeadId
      ? admin
          .from("conversation_ai_qualifications")
          .select("id,score,sales_stage,priority,summary,next_best_action,created_at")
          .eq("organization_id", input.organizationId)
          .eq("lead_id", input.sourceLeadId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const events: Customer360Event[] = [];
  for (const call of voiceResult.data || []) {
    const detail = [
      call.summary,
      call.lead_score !== null ? `Lead Score ${call.lead_score}/100` : null,
      call.temperature ? `Sıcaklık: ${call.temperature}` : null,
      call.duration_seconds ? `${call.duration_seconds} sn` : null,
      call.next_best_action ? `Sonraki aksiyon: ${call.next_best_action}` : null,
    ].filter(Boolean).join(" · ");
    events.push({ id: `phone-${call.id}`, kind: "phone", title: "AI telefon görüşmesi", detail: detail || call.state, at: call.started_at, href: `/voice/calls/${call.id}` });
  }
  for (const activity of activityResult.data || []) {
    events.push({ id: `activity-${activity.id}`, kind: "activity", title: activity.title || activity.type, detail: activity.detail || "CRM aktivitesi", at: activity.created_at });
  }
  for (const ai of aiResult.data || []) {
    events.push({ id: `ai-${ai.id}`, kind: "ai", title: `Conversation Intelligence · Score ${ai.score}`, detail: `${ai.sales_stage || "new_lead"} · ${ai.priority || "medium"} · ${ai.summary}${ai.next_best_action ? ` · Sonraki aksiyon: ${ai.next_best_action}` : ""}`, at: ai.created_at });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 80);
}
