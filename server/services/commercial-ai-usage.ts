import { z } from "zod";

export const commercialAiUsageSchema = z.object({
  workspaceId: z.string().uuid(),
  capability: z.enum(["lead_scoring", "next_best_action", "opportunity_summary", "follow_up_draft", "product_recommendation", "quote_recommendation"]),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
});

export type CommercialAiUsage = z.infer<typeof commercialAiUsageSchema>;

export function estimateAiCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}) {
  const inputCost = (input.inputTokens / 1_000_000) * input.inputUsdPerMillion;
  const outputCost = (input.outputTokens / 1_000_000) * input.outputUsdPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

export function usagePercent(runCount: number, monthlyLimit: number) {
  if (monthlyLimit <= 0) return 100;
  return Math.min(100, Math.round((runCount / monthlyLimit) * 100));
}
