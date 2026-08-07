import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { listConversationAuditEvents, recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

const PROVIDERS = ["whatsapp", "instagram", "facebook"];

async function providerForConversation(organizationId: string, conversationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("conversations").select("provider")
    .eq("organization_id", organizationId).eq("id", conversationId).maybeSingle();
  if (error || !data || !PROVIDERS.includes(data.provider)) throw new Error("Messaging conversation not found in this workspace.");
  return data.provider as "whatsapp" | "instagram" | "facebook";
}

export async function listOmnichannelConversationAuditEvents(input: { organizationId: string; conversationId: string; limit?: number }) {
  const provider = await providerForConversation(input.organizationId, input.conversationId);
  if (provider === "whatsapp") return listConversationAuditEvents(input);

  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("omnichannel_audit_events")
    .select("id,event_type,actor_user_id,metadata,created_at")
    .eq("organization_id", input.organizationId)
    .eq("conversation_id", input.conversationId)
    .eq("provider", provider)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Unable to load conversation audit history: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventType: row.event_type as string,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}

export async function recordOmnichannelReviewEvent(input: { organizationId: string; conversationId: string; userId: string }) {
  const provider = await providerForConversation(input.organizationId, input.conversationId);
  if (provider === "whatsapp") {
    return recordWhatsAppAuditEvent({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      actorUserId: input.userId,
      eventType: "ai_suggestion_reviewed",
      metadata: { reviewAction: "copied_for_review" },
    });
  }
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("omnichannel_audit_events").insert({
    organization_id: input.organizationId,
    provider,
    conversation_id: input.conversationId,
    actor_user_id: input.userId,
    event_type: "ai_suggestion_reviewed",
    metadata: { reviewAction: "copied_for_review" },
  });
  if (error) throw new Error(`Unable to persist conversation audit event: ${error.message}`);
  return true;
}
