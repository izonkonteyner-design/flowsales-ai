import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Status Rank mapping matching migration 0036 update_message_delivery_status:
 * pending=1, accepted=2, sent=3, delivered=4, read=5, failed=99
 */
function getStatusRank(status: string): number {
  switch (status) {
    case "pending": return 1;
    case "accepted": return 2;
    case "sent": return 3;
    case "delivered": return 4;
    case "read": return 5;
    case "failed": return 99;
    default: return 0;
  }
}

export interface MockMessageState {
  id: string;
  organizationId: string;
  providerMessageId: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
}

export function simulateDeliveryStatusUpdate(
  message: MockMessageState,
  requestOrgId: string,
  providerMessageId: string,
  newStatus: string,
  occurredAt: string,
  errorPayload?: { error_code?: string; error_message?: string } | null
): { updated: boolean; currentStatus: string; message: MockMessageState } {
  // Cross-organization boundary check
  if (message.organizationId !== requestOrgId) {
    return { updated: false, currentStatus: message.status, message };
  }

  // Unknown wamid check
  if (message.providerMessageId !== providerMessageId) {
    return { updated: false, currentStatus: message.status, message };
  }

  const currentRank = getStatusRank(message.status);
  const newRank = getStatusRank(newStatus);

  // Monotonic safeguards:
  // 1. If already read (5) and new status is lower (sent, delivered, accepted, pending), ignore
  if (currentRank >= 5 && ["sent", "delivered", "accepted", "pending"].includes(newStatus)) {
    return { updated: false, currentStatus: message.status, message };
  }

  // 2. If already delivered (4) and new status is sent, accepted, or pending, ignore
  if (currentRank >= 4 && ["sent", "accepted", "pending"].includes(newStatus)) {
    return { updated: false, currentStatus: message.status, message };
  }

  // 3. If already read (5) and new status is failed, ignore
  if (currentRank >= 5 && newStatus === "failed") {
    return { updated: false, currentStatus: message.status, message };
  }

  if (newRank >= currentRank || newStatus === "failed") {
    const updatedMsg: MockMessageState = {
      ...message,
      status: newStatus,
      sentAt: newStatus === "sent" && !message.sentAt ? occurredAt : message.sentAt,
      deliveredAt: newStatus === "delivered" && !message.deliveredAt ? occurredAt : message.deliveredAt,
      readAt: newStatus === "read" && !message.readAt ? occurredAt : message.readAt,
      failedAt: newStatus === "failed" && !message.failedAt ? occurredAt : message.failedAt,
      errorCode: errorPayload?.error_code || message.errorCode,
    };
    return { updated: true, currentStatus: newStatus, message: updatedMsg };
  }

  return { updated: false, currentStatus: message.status, message };
}

describe("WhatsApp Delivery & Read Status Lifecycle Tests", () => {
  const orgA = "11111111-1111-4111-a111-111111111111";
  const orgB = "22222222-2222-4222-a222-222222222222";
  const wamid = "wamid.HBgMOTA1NTUwNzQzMDI2FQIAERgUQ0U4QzNBQTNBQUFDREVFQTY1QTYA";

  const initialMsg: MockMessageState = {
    id: "msg-100",
    organizationId: orgA,
    providerMessageId: wamid,
    status: "pending",
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    errorCode: null,
  };

  it("progresses monotonically: sent -> delivered -> read", () => {
    // 1. sent
    const step1 = simulateDeliveryStatusUpdate(initialMsg, orgA, wamid, "sent", "2026-08-07T12:00:00Z");
    assert.equal(step1.updated, true);
    assert.equal(step1.message.status, "sent");
    assert.equal(step1.message.sentAt, "2026-08-07T12:00:00Z");

    // 2. delivered
    const step2 = simulateDeliveryStatusUpdate(step1.message, orgA, wamid, "delivered", "2026-08-07T12:00:02Z");
    assert.equal(step2.updated, true);
    assert.equal(step2.message.status, "delivered");
    assert.equal(step2.message.deliveredAt, "2026-08-07T12:00:02Z");

    // 3. read
    const step3 = simulateDeliveryStatusUpdate(step2.message, orgA, wamid, "read", "2026-08-07T12:00:05Z");
    assert.equal(step3.updated, true);
    assert.equal(step3.message.status, "read");
    assert.equal(step3.message.readAt, "2026-08-07T12:00:05Z");
  });

  it("handles duplicate delivered webhook safely without state corruption", () => {
    const deliveredMsg: MockMessageState = {
      ...initialMsg,
      status: "delivered",
      sentAt: "2026-08-07T12:00:00Z",
      deliveredAt: "2026-08-07T12:00:02Z",
    };

    const res = simulateDeliveryStatusUpdate(deliveredMsg, orgA, wamid, "delivered", "2026-08-07T12:00:03Z");
    assert.equal(res.message.status, "delivered");
    assert.equal(res.message.deliveredAt, "2026-08-07T12:00:02Z"); // Preserves initial timestamp
  });

  it("blocks out-of-order sent received after delivered", () => {
    const deliveredMsg: MockMessageState = {
      ...initialMsg,
      status: "delivered",
      sentAt: "2026-08-07T12:00:00Z",
      deliveredAt: "2026-08-07T12:00:02Z",
    };

    const res = simulateDeliveryStatusUpdate(deliveredMsg, orgA, wamid, "sent", "2026-08-07T12:00:04Z");
    assert.equal(res.updated, false);
    assert.equal(res.currentStatus, "delivered");
  });

  it("blocks out-of-order delivered received after read", () => {
    const readMsg: MockMessageState = {
      ...initialMsg,
      status: "read",
      sentAt: "2026-08-07T12:00:00Z",
      deliveredAt: "2026-08-07T12:00:02Z",
      readAt: "2026-08-07T12:00:05Z",
    };

    const res = simulateDeliveryStatusUpdate(readMsg, orgA, wamid, "delivered", "2026-08-07T12:00:06Z");
    assert.equal(res.updated, false);
    assert.equal(res.currentStatus, "read");
  });

  it("handles failed delivery status and records error details", () => {
    const res = simulateDeliveryStatusUpdate(
      initialMsg,
      orgA,
      wamid,
      "failed",
      "2026-08-07T12:00:01Z",
      { error_code: "131026", error_message: "Message undeliverable" }
    );
    assert.equal(res.updated, true);
    assert.equal(res.message.status, "failed");
    assert.equal(res.message.failedAt, "2026-08-07T12:00:01Z");
    assert.equal(res.message.errorCode, "131026");
  });

  it("rejects unknown wamid gracefully without modifying existing records", () => {
    const res = simulateDeliveryStatusUpdate(initialMsg, orgA, "wamid.UNKNOWN", "delivered", "2026-08-07T12:00:00Z");
    assert.equal(res.updated, false);
    assert.equal(res.currentStatus, "pending");
  });

  it("prevents cross-organization status update attempts", () => {
    const res = simulateDeliveryStatusUpdate(initialMsg, orgB, wamid, "read", "2026-08-07T12:00:00Z");
    assert.equal(res.updated, false);
    assert.equal(res.currentStatus, "pending");
  });
});
