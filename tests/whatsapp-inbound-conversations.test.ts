import assert from "node:assert/strict";
import test from "node:test";
import { parseWhatsAppInbound } from "@/server/services/integrations/whatsapp-inbound";

test("parses text, interactive and media inbound messages without exposing media URLs", () => {
  const messages = parseWhatsAppInbound({
    contacts: [{ wa_id: "905551112233", profile: { name: "Test User" } }],
    messages: [
      { id: "wamid.text", from: "905551112233", timestamp: "1700000000", type: "text", text: { body: "Hello" } },
      { id: "wamid.reply", from: "905551112233", timestamp: "1700000001", type: "interactive", interactive: { button_reply: { id: "yes", title: "Yes" } } },
      { id: "wamid.image", from: "905551112233", timestamp: "1700000002", type: "image", image: { id: "media-1", mime_type: "image/jpeg", caption: "Photo" } },
    ],
  });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].body, "Hello");
  assert.equal(messages[0].senderName, "Test User");
  assert.equal(messages[1].messageType, "interactive");
  assert.equal(messages[1].body, "Yes");
  assert.deepEqual(messages[2].attachment?.externalId, "media-1");
  assert.equal("url" in (messages[2].attachment?.metadata ?? {}), false);
});

test("maps location, contact, reaction and unsupported messages safely", () => {
  const base = { from: "1", timestamp: "1700000000" };
  const result = parseWhatsAppInbound({ messages: [
    { ...base, id: "loc", type: "location", location: { latitude: 1, longitude: 2 } },
    { ...base, id: "contact", type: "contacts", contacts: [{ name: { formatted_name: "A" } }] },
    { ...base, id: "reaction", type: "reaction", reaction: { emoji: "ok", message_id: "x" } },
    { ...base, id: "unknown", type: "future_type", future_type: { arbitrary: true } },
  ] });
  assert.deepEqual(result.map((item) => item.messageType), ["system", "system", "system", "system"]);
  assert.equal(result[0].attachment?.type, "location");
  assert.equal(result[2].body, "ok");
  assert.equal(result[3].metadata.providerType, "future_type");
});

test("drops malformed records without deterministic ids", () => {
  assert.deepEqual(parseWhatsAppInbound({ messages: [{ from: "1", type: "text" }, { id: "x" }] }), []);
});
