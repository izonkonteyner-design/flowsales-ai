import assert from "node:assert/strict";
import test from "node:test";

import { createSalesSession, updateSalesSessionQualification } from "@/server/services/sales-session/domain";
import { scorePhoneQualification } from "@/server/services/sales-session/phone-intelligence";
import {
  assertShowroomClaimMatchesTrustedSource,
  findTrustedShowrooms,
  ShowroomTruthUnavailableError,
  type ShowroomRecord,
} from "@/server/services/sales-tools/showroom-domain";
import { evaluateSalesAction } from "@/server/services/sales-policy/commercial-commitment";
import {
  VoiceAdapterRegistry,
  type VoiceCallContext,
  type VoiceChannelAdapter,
} from "@/server/services/voice-channel/adapter";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const showroomId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";

test("task 6: showroom truth only exposes active source-backed showroom facts", () => {
  const records: ShowroomRecord[] = [
    {
      id: showroomId,
      workspaceId,
      name: "İzmir Showroom",
      city: "İzmir",
      district: "Kemalpaşa",
      address: "Örnek Mah. 1, Kemalpaşa/İzmir",
      appointmentRequired: true,
      active: true,
      productIds: [productId],
      visitingHours: "09:00-18:00",
      updatedAt: "2026-08-10T12:00:00.000Z",
    },
  ];

  const [truth] = findTrustedShowrooms(records, { city: "İzmir", productId });
  assert.equal(truth.source, "trusted_showroom");
  assert.equal(truth.sourceId, showroomId);
  assert.equal(truth.appointmentRequired, true);
  assert.doesNotThrow(() => assertShowroomClaimMatchesTrustedSource({ claimedAddress: truth.address, appointmentRequired: true, truth }));
  assert.throws(
    () => assertShowroomClaimMatchesTrustedSource({ claimedAddress: "Yanlış adres", appointmentRequired: true, truth }),
    ShowroomTruthUnavailableError,
  );
});

test("task 7: phone qualification captures commercial and visit intent without mutating CRM", () => {
  const session = createSalesSession({ id: sessionId, workspaceId, channel: "phone", channelSessionId: "call-123", now: new Date("2026-08-10T12:00:00.000Z") });
  const qualified = updateSalesSessionQualification(session, {
    productInterest: "56 m² 2+1 konteyner",
    areaM2: 56,
    roomCount: "2+1",
    budget: 700000,
    currency: "TRY",
    deliveryLocation: "İzmir Kemalpaşa",
    landReady: true,
    siteAccessKnown: true,
    usagePurpose: "Hobi bahçesi",
    purchaseTiming: "30 gün içinde",
    decisionRole: "decision_maker",
    showroomVisitIntent: true,
    preferredVisitDate: "2026-08-15T10:00:00.000Z",
    quoteRequested: true,
    pricingIntent: true,
  }, new Date("2026-08-10T12:05:00.000Z"));

  assert.equal(qualified.channel, "phone");
  assert.equal(qualified.qualification.deliveryLocation, "İzmir Kemalpaşa");
  assert.equal(qualified.qualification.showroomVisitIntent, true);
  assert.equal(qualified.qualification.quoteRequested, true);
  assert.equal(qualified.leadId, null);
});

test("task 8: phone uses the shared FlowSales lead-score factors and weights", () => {
  const session = createSalesSession({ id: sessionId, workspaceId, channel: "phone", channelSessionId: "call-456" });
  const qualified = updateSalesSessionQualification(session, {
    productInterest: "56 m² 2+1",
    pricingIntent: true,
    availabilityIntent: true,
    deliveryLocation: "İzmir",
    budget: 700000,
    purchaseTiming: "Bu ay",
    usagePurpose: "Tarla evi",
    quoteRequested: true,
  });
  const result = scorePhoneQualification(qualified.qualification);

  assert.equal(result.score, 100);
  assert.ok(result.breakdown.some((item) => item.factor === "product_interest" && item.points === 15));
  assert.ok(result.breakdown.some((item) => item.factor === "quote_requested" && item.points === 20));
  assert.ok(result.breakdown.some((item) => item.factor === "budget_known" && item.points === 15));
});

test("task 9: safe automation is separated from commercial commitments", () => {
  assert.equal(evaluateSalesAction("answer_product_question").decision, "allowed");
  assert.equal(evaluateSalesAction("schedule_follow_up_task").decision, "allowed");
  assert.equal(evaluateSalesAction("send_customer_message").decision, "approval_required");
  assert.equal(evaluateSalesAction("apply_discount").decision, "approval_required");
  assert.equal(evaluateSalesAction("promise_delivery_date").decision, "blocked");
  assert.equal(evaluateSalesAction("collect_payment").decision, "blocked");
});

test("task 10: voice adapter registry is provider independent", async () => {
  const calls: string[] = [];
  const adapter: VoiceChannelAdapter = {
    provider: "test-voice",
    async verifyWebhook() { return true; },
    async parseInboundEvent() { return null; },
    async answerCall() { calls.push("answer"); },
    async speak() { calls.push("speak"); },
    async transferCall() { calls.push("transfer"); },
    async hangup() { calls.push("hangup"); },
  };
  const registry = new VoiceAdapterRegistry();
  registry.register(adapter);
  assert.equal(registry.has("TEST-VOICE"), true);

  const call: VoiceCallContext = {
    provider: "test-voice",
    providerCallId: "provider-call-1",
    workspaceId,
    salesSessionId: sessionId,
    direction: "inbound",
    from: "+905550000000",
    to: "+902320000000",
    state: "answered",
  };
  await registry.get("test-voice").answerCall(call);
  await registry.get("test-voice").speak(call, "Merhaba");
  await registry.get("test-voice").transferCall(call, "+905551111111");
  await registry.get("test-voice").hangup(call);
  assert.deepEqual(calls, ["answer", "speak", "transfer", "hangup"]);
});
