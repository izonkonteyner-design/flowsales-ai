import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhoneNumberToE164,
  validateTestRecipient,
  ALLOWLISTED_TEST_RECIPIENT_CANONICAL,
} from "@/lib/utils/test-recipient-guard";

describe("Test Recipient Allowlist & Phone Normalization Guard Tests", () => {
  it("normalizes Turkish phone number formats deterministically to canonical E.164 digits", () => {
    assert.equal(normalizePhoneNumberToE164("05550743026"), "905550743026");
    assert.equal(normalizePhoneNumberToE164("5550743026"), "905550743026");
    assert.equal(normalizePhoneNumberToE164("+905550743026"), "905550743026");
    assert.equal(normalizePhoneNumberToE164("905550743026"), "905550743026");
    assert.equal(normalizePhoneNumberToE164(" +90 (555) 074 30 26 "), "905550743026");
  });

  it("allows 05550743026 in all supported formatting variants", () => {
    const res1 = validateTestRecipient("05550743026");
    assert.equal(res1.allowed, true);
    assert.equal(res1.canonical, ALLOWLISTED_TEST_RECIPIENT_CANONICAL);

    const res2 = validateTestRecipient("+905550743026");
    assert.equal(res2.allowed, true);
    assert.equal(res2.canonical, ALLOWLISTED_TEST_RECIPIENT_CANONICAL);

    const res3 = validateTestRecipient("5550743026");
    assert.equal(res3.allowed, true);
    assert.equal(res3.canonical, ALLOWLISTED_TEST_RECIPIENT_CANONICAL);

    const res4 = validateTestRecipient("905550743026");
    assert.equal(res4.allowed, true);
    assert.equal(res4.canonical, ALLOWLISTED_TEST_RECIPIENT_CANONICAL);
  });

  it("blocks non-allowlisted customer numbers and test numbers", () => {
    const res1 = validateTestRecipient("905333592024");
    assert.equal(res1.allowed, false);
    assert.match(res1.message || "", /blocked/i);

    const res2 = validateTestRecipient("905356899605");
    assert.equal(res2.allowed, false);
    assert.match(res2.message || "", /blocked/i);

    const res3 = validateTestRecipient("+14155552671");
    assert.equal(res3.allowed, false);
    assert.match(res3.message || "", /blocked/i);
  });

  it("blocks missing, null, or empty phone numbers", () => {
    const res1 = validateTestRecipient(null);
    assert.equal(res1.allowed, false);

    const res2 = validateTestRecipient(undefined);
    assert.equal(res2.allowed, false);

    const res3 = validateTestRecipient("");
    assert.equal(res3.allowed, false);
  });
});
