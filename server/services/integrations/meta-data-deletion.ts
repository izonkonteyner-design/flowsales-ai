import "server-only";

import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

type SignedRequestData = { user_id?: string };

function appSecrets() {
  return [process.env.META_APP_SECRET?.trim(), process.env.META_CLIENT_SECRET?.trim(), process.env.INSTAGRAM_APP_SECRET?.trim(), process.env.META_INSTAGRAM_APP_SECRET?.trim()]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function verifyMetaDeletionSignedRequest(signedRequest: string): string | null {
  const [encodedSignature, encodedPayload, ...rest] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload || rest.length > 0) return null;
  const supplied = decodeBase64Url(encodedSignature);
  const payloadBuffer = decodeBase64Url(encodedPayload);
  const valid = appSecrets().some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
  if (!valid) return null;
  try {
    const payload = JSON.parse(payloadBuffer.toString("utf8")) as SignedRequestData;
    return typeof payload.user_id === "string" && payload.user_id.length > 0 ? payload.user_id : null;
  } catch { return null; }
}

export async function deleteMetaSubjectData(subjectId: string) {
  const admin = createSupabaseAdminClient();
  const { data: contacts, error: contactError } = await admin.from("channel_contacts").select("id,organization_id,provider").in("provider", ["instagram", "facebook"]).eq("external_id", subjectId);
  if (contactError) throw new Error("Unable to locate Meta subject data.");
  for (const contact of contacts ?? []) {
    // Meta messaging webhook events store a single event object whose sender ID is
    // directly addressable in JSON. Remove that operational copy as well.
    const { error: webhookDeleteError } = await admin.from("webhook_events")
      .delete().eq("organization_id", contact.organization_id).eq("provider", contact.provider)
      .contains("payload", { sender: { id: subjectId } });
    if (webhookDeleteError) throw new Error("Unable to delete Meta webhook event data.");
    const { data: conversations, error: conversationError } = await admin.from("conversations").select("id").eq("organization_id", contact.organization_id).eq("channel_contact_id", contact.id);
    if (conversationError) throw new Error("Unable to locate Meta conversations.");
    const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
    if (conversationIds.length > 0) {
      const { data: messages, error: messageError } = await admin.from("messages").select("id").eq("organization_id", contact.organization_id).in("conversation_id", conversationIds);
      if (messageError) throw new Error("Unable to locate Meta messages.");
      const messageIds = (messages ?? []).map((message) => message.id);
      if (messageIds.length > 0) {
        const { error } = await admin.from("message_attachments").delete().eq("organization_id", contact.organization_id).in("message_id", messageIds);
        if (error) throw new Error("Unable to delete Meta message attachments.");
      }
      const { error: deleteMessagesError } = await admin.from("messages").delete().eq("organization_id", contact.organization_id).in("conversation_id", conversationIds);
      if (deleteMessagesError) throw new Error("Unable to delete Meta messages.");
      const { error: deleteConversationsError } = await admin.from("conversations").delete().eq("organization_id", contact.organization_id).in("id", conversationIds);
      if (deleteConversationsError) throw new Error("Unable to delete Meta conversations.");
    }
    const { error: deleteContactError } = await admin.from("channel_contacts").delete().eq("id", contact.id).eq("organization_id", contact.organization_id);
    if (deleteContactError) throw new Error("Unable to delete Meta contact data.");
  }
  return { deletedContacts: contacts?.length ?? 0 };
}
