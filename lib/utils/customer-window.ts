export function validateCustomerWindow(lastInboundAt?: string | Date | null): {
  allowed: boolean;
  reason?: "template_required" | "missing_inbound" | "future_timestamp" | "expired";
} {
  if (!lastInboundAt) {
    return { allowed: false, reason: "missing_inbound" };
  }

  const inboundDate = new Date(lastInboundAt);
  if (isNaN(inboundDate.getTime())) {
    return { allowed: false, reason: "missing_inbound" };
  }

  const now = new Date();
  const diffMs = now.getTime() - inboundDate.getTime();

  // Future timestamp edge case
  if (diffMs < 0) {
    return { allowed: false, reason: "future_timestamp" };
  }

  // 24 hours = 24 * 60 * 60 * 1000 = 86,400,000 ms
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (diffMs > TWENTY_FOUR_HOURS_MS) {
    return { allowed: false, reason: "expired" };
  }

  return { allowed: true };
}
