type JsonObject = Record<string, unknown>;

export type WhatsAppInboundMessage = {
  externalId: string;
  senderId: string;
  senderName: string | null;
  occurredAt: string;
  messageType: "text" | "image" | "video" | "audio" | "document" | "interactive" | "system";
  body: string | null;
  attachment: null | {
    type: "image" | "video" | "audio" | "document" | "sticker" | "location";
    externalId: string | null;
    mimeType: string | null;
    fileName: string | null;
    metadata: JsonObject;
  };
  metadata: JsonObject;
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseWhatsAppInbound(value: JsonObject): WhatsAppInboundMessage[] {
  const contacts = Array.isArray(value.contacts) ? value.contacts.map(object) : [];
  const names = new Map(contacts.map((contact) => [text(contact.wa_id), text(object(contact.profile).name)]));
  const messages = Array.isArray(value.messages) ? value.messages.map(object) : [];

  return messages.flatMap((message) => {
    const externalId = text(message.id);
    const senderId = text(message.from);
    if (!externalId || !senderId) return [];

    const providerType = text(message.type) ?? "unsupported";
    const typed = object(message[providerType]);
    let body: string | null = null;
    let messageType: WhatsAppInboundMessage["messageType"] = "system";
    let attachment: WhatsAppInboundMessage["attachment"] = null;

    if (providerType === "text") {
      messageType = "text";
      body = text(typed.body);
    } else if (providerType === "button") {
      messageType = "interactive";
      body = text(typed.text) ?? text(typed.payload);
    } else if (providerType === "interactive") {
      messageType = "interactive";
      const reply = object(typed.button_reply ?? typed.list_reply);
      body = text(reply.title) ?? text(reply.id);
    } else if (["image", "video", "audio", "document", "sticker"].includes(providerType)) {
      messageType = providerType === "sticker" ? "image" : providerType as WhatsAppInboundMessage["messageType"];
      body = text(typed.caption);
      attachment = {
        type: providerType as NonNullable<WhatsAppInboundMessage["attachment"]>["type"],
        externalId: text(typed.id),
        mimeType: text(typed.mime_type),
        fileName: text(typed.filename),
        metadata: { sha256: text(typed.sha256), animated: typed.animated === true },
      };
    } else if (providerType === "location") {
      messageType = "system";
      body = text(typed.name) ?? text(typed.address);
      attachment = { type: "location", externalId: null, mimeType: null, fileName: null, metadata: typed };
    } else if (providerType === "contacts") {
      messageType = "system";
      body = "Shared contact";
    } else if (providerType === "reaction") {
      messageType = "system";
      body = text(typed.emoji);
    }

    const seconds = Number(message.timestamp);
    const occurredAt = Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds * 1000).toISOString()
      : new Date().toISOString();

    return [{
      externalId,
      senderId,
      senderName: names.get(senderId) ?? null,
      occurredAt,
      messageType,
      body,
      attachment,
      metadata: { providerType, context: object(message.context), providerPayload: typed },
    }];
  });
}

export async function persistWhatsAppInbound(params: {
  organizationId: string;
  connectionId: string;
  messages: WhatsAppInboundMessage[];
}) {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/server-admin");
  const supabase = createSupabaseAdminClient();
  const results: Array<{ messageId: string; duplicate: boolean }> = [];

  for (const message of params.messages) {
    const { data, error } = await supabase.rpc("persist_whatsapp_inbound_message", {
      p_organization_id: params.organizationId,
      p_connection_id: params.connectionId,
      p_external_message_id: message.externalId,
      p_sender_external_id: message.senderId,
      p_sender_name: message.senderName,
      p_message_type: message.messageType,
      p_body: message.body,
      p_occurred_at: message.occurredAt,
      p_metadata: message.metadata,
      p_attachment: message.attachment,
    });
    if (error) throw new Error(`WhatsApp inbound persistence failed (${error.code ?? "unknown"}).`);
    const row = Array.isArray(data) ? data[0] : data;
    results.push({ messageId: String(row?.message_id ?? ""), duplicate: Boolean(row?.duplicate) });
  }
  return results;
}
