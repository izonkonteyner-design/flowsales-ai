import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("WhatsApp AI reply suggestion is human-in-loop and never sends automatically", async () => {
  const service = await source("server/services/integrations/whatsapp-ai-suggestion.ts");
  const route = await source("app/api/inbox/conversations/[conversationId]/ai-suggestion/route.ts");
  const panel = await source("components/inbox/ai-reply-suggestion.tsx");
  assert.match(service, /A human will review and explicitly send it/i);
  assert.match(service, /Never invent prices, stock, delivery dates, discounts, guarantees/i);
  assert.match(route, /requiresHumanSend: true/);
  assert.doesNotMatch(route, /WhatsAppOutboundService|sendOutboundReply|sendTemplateMessage/);
  assert.match(panel, /Draft only — never auto-sends/);
  assert.match(panel, /Copy for review/);
});

test("WhatsApp media retrieval is authenticated, tenant scoped, bounded and no-store", async () => {
  const service = await source("server/services/integrations/whatsapp-media.ts");
  const route = await source("app/api/inbox/attachments/[attachmentId]/route.ts");
  const timeline = await source("components/inbox/message-timeline.tsx");
  assert.match(service, /\.eq\("organization_id", params\.organizationId\)/);
  assert.match(service, /MAX_MEDIA_BYTES = 25 \* 1024 \* 1024/);
  assert.match(service, /ALLOWED_MEDIA_HOST_SUFFIXES/);
  assert.match(service, /decryptToken/);
  assert.match(route, /loadWorkspaceContext/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.match(route, /X-Content-Type-Options.*nosniff/);
  assert.match(timeline, /\/api\/inbox\/attachments\/\$\{att\.id\}/);
});

test("WhatsApp health check repairs missing webhook subscription and fails degraded if recovery fails", async () => {
  const health = await source("server/services/integrations/whatsapp-health-check.ts");
  assert.match(health, /subscribeWabaToApp/);
  assert.match(health, /webhook_subscription_missing/);
  assert.match(health, /wabaAccess && phoneNumberAccess && webhookSubscribed/);
  assert.match(health, /webhook_subscribed_at/);
});

test("WhatsApp self-service onboarding uses Embedded Signup without manual access-token UI", async () => {
  const page = await source("app/(app)/settings/integrations/page.tsx");
  const button = await source("components/settings/whatsapp-connect-button.tsx");
  const signup = await source("server/services/integrations/whatsapp-embedded-signup.ts");
  assert.match(page, /WhatsApp self-service setup/);
  assert.match(page, /without manually copying access tokens/i);
  assert.match(button, /Meta Embedded Signup/);
  assert.match(button, /response_type: "code"/);
  assert.match(signup, /encryptToken\(tokenResp\.access_token\)/);
  assert.match(signup, /subscribeWabaToApp/);
  assert.doesNotMatch(page, /access_token|access token/i);
});
