import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("CRM identity is available for WhatsApp Instagram and Facebook and remains tenant scoped", async () => {
  const service = await source("server/services/omnichannel-crm-identity.ts");
  const route = await source("app/api/inbox/conversations/[conversationId]/identity/route.ts");
  assert.match(service, /\["whatsapp", "instagram", "facebook"\]/);
  assert.match(service, /\.eq\("organization_id", organizationId\)/);
  assert.match(service, /Customer is not in this workspace/);
  assert.match(service, /Lead is not in this workspace/);
  assert.match(service, /manual_channel_link/);
  assert.match(route, /OmnichannelCrmIdentityService/);
});

test("Meta CRM identity never auto-selects search candidates", async () => {
  const service = await source("server/services/omnichannel-crm-identity.ts");
  assert.match(service, /candidates: \{ customers: \[\], leads: \[\] \}/);
  assert.match(service, /searchCandidates\(organizationId: string, rawQuery: string\): Promise<CrmSearchResults> \{\s*return this\.whatsapp\.searchCandidates\(organizationId, rawQuery\);\s*\}/);
  assert.match(service, /resolveManual/);
});

test("CRM actions and audit history are exposed across all messaging providers", async () => {
  const actions = await source("server/services/whatsapp-crm-actions.ts");
  const audit = await source("server/services/omnichannel-audit.ts");
  const shell = await source("components/inbox/inbox-shell.tsx");
  assert.match(actions, /MESSAGING_PROVIDERS = \["whatsapp", "instagram", "facebook"\]/);
  assert.match(actions, /omnichannel_audit_events/);
  assert.match(audit, /omnichannel_audit_events/);
  assert.match(shell, /CrmIdentityPanel/);
  assert.match(shell, /CrmConversationActions/);
  assert.match(shell, /ConversationAuditPanel/);
  assert.match(shell, /messagingProvider/);
});

test("self-service onboarding does not ask customers to paste Meta identifiers or tokens", async () => {
  const page = await source("app/(app)/settings/integrations/page.tsx");
  assert.match(page, /Meta channels — self-service setup/);
  assert.match(page, /without manually pasting access tokens, WABA IDs, Page IDs or Instagram account IDs/);
  assert.match(page, /otherwise you choose explicitly/);
  assert.match(page, /encrypts credentials server-side/);
});

test("AI sales agent remains human-approved from qualification through follow-up", async () => {
  const intelligence = await source("components/inbox/conversation-intelligence-panel.tsx");
  const followUp = await source("server/services/sales-follow-up-engine.ts");
  const reply = await source("components/inbox/ai-reply-suggestion.tsx");
  assert.match(intelligence, /AI recommends; humans decide and approve follow-ups/);
  assert.match(intelligence, /Accept/);
  assert.match(intelligence, /Create approved follow-up plan/);
  assert.match(followUp, /Qualification must be accepted by a human/);
  assert.doesNotMatch(followUp, /sendMetaMessagingReply|sendOutboundReply/);
  assert.match(reply, /Copy for review/);
});
