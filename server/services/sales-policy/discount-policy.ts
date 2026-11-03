/**
 * FlowSales AI - Centralized Discount Policy
 * Single Source of Truth for quote discount governance across Quote Copilot,
 * AI Sales Autopilot, Server Actions, and REST API endpoints.
 */

export const MAX_REPRESENTATIVE_DISCOUNT_PERCENT = 8; // Sales rep can discount max 8% without approval
export const MAX_ABSOLUTE_DISCOUNT_CEILING = 30; // Absolute ceiling for commercial proposals

export interface DiscountPolicyEvaluation {
  valid: boolean;
  effectiveDiscountPercent: number;
  requiresManagerApproval: boolean;
  reason?: string;
}

/**
 * Evaluates requested discount percent against role-based commercial policy.
 * - Negative or non-numeric discount: strictly invalid (rejected).
 * - Discount > 30%: strictly rejected (exceeds system ceiling).
 * - Discount <= 8%: valid, autonomous rep execution (no manager approval needed).
 * - Discount > 8%: requires owner/admin manager approval.
 * - Owner/Admin role: valid without approval (up to ceiling).
 */
export function evaluateDiscountPolicy(
  discountPercent: number,
  userRole: string = "sales"
): DiscountPolicyEvaluation {
  if (typeof discountPercent !== "number" || isNaN(discountPercent) || discountPercent < 0) {
    return {
      valid: false,
      effectiveDiscountPercent: 0,
      requiresManagerApproval: false,
      reason: "İskonto oranı negatif veya geçersiz olamaz.",
    };
  }

  if (discountPercent > MAX_ABSOLUTE_DISCOUNT_CEILING) {
    return {
      valid: false,
      effectiveDiscountPercent: 0,
      requiresManagerApproval: true,
      reason: `Talep edilen iskonto oranı (%${discountPercent}) sistem tavanı olan %${MAX_ABSOLUTE_DISCOUNT_CEILING}'i aşamaz.`,
    };
  }

  // Owner ve Admin rolleri doğrudan onaylıdır (tavanı aşmamak kaydıyla)
  if (userRole === "owner" || userRole === "admin") {
    return {
      valid: true,
      effectiveDiscountPercent: discountPercent,
      requiresManagerApproval: false,
    };
  }

  // Standart satış temsilcisi veya otopilot:
  // %8 ve altı onaysız uygulanabilir; %8 üzeri yönetici onayı gerektirir.
  if (discountPercent > MAX_REPRESENTATIVE_DISCOUNT_PERCENT) {
    return {
      valid: true,
      effectiveDiscountPercent: discountPercent,
      requiresManagerApproval: true,
      reason: `Talep edilen iskonto oranı (%${discountPercent}) temsilci yetki tavanı olan %${MAX_REPRESENTATIVE_DISCOUNT_PERCENT}'i aştığı için yönetici onayı gereklidir.`,
    };
  }

  return {
    valid: true,
    effectiveDiscountPercent: discountPercent,
    requiresManagerApproval: false,
  };
}
