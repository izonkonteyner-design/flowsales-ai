/**
 * Normalizes a phone number to canonical E.164 digits without leading plus (e.g. 905550743026).
 * Handles Turkish phone number formats:
 * - 05550743026 -> 905550743026
 * - 5550743026 -> 905550743026
 * - +905550743026 -> 905550743026
 * - 905550743026 -> 905550743026
 */
export function normalizePhoneNumberToE164(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // Turkish 10-digit number starting with 5 (e.g. 5550743026)
  if (digits.length === 10 && digits.startsWith("5")) {
    return `90${digits}`;
  }

  // Turkish 11-digit number starting with 05 (e.g. 05550743026)
  if (digits.length === 11 && digits.startsWith("05")) {
    return `90${digits.slice(1)}`;
  }

  return digits;
}

export const ALLOWLISTED_TEST_RECIPIENT_CANONICAL = "905550743026";

export interface TestRecipientValidationResult {
  allowed: boolean;
  canonical: string;
  message?: string;
}

/**
 * Validates whether a phone number matches the strict allowlisted test recipient (05550743026).
 * Used for all automated, test, verification, and diagnostic outbound sends.
 */
export function validateTestRecipient(phone: string | null | undefined): TestRecipientValidationResult {
  const canonical = normalizePhoneNumberToE164(phone);

  if (!canonical) {
    return {
      allowed: false,
      canonical: "",
      message: "Test recipient phone number is missing or invalid.",
    };
  }

  if (canonical !== ALLOWLISTED_TEST_RECIPIENT_CANONICAL) {
    return {
      allowed: false,
      canonical,
      message: `Automated test outbound message blocked: Recipient phone number (canonical: ${canonical}) is not on the strict allowlist (05550743026 required).`,
    };
  }

  return {
    allowed: true,
    canonical,
  };
}
