import type { AiCapability } from "./domain";
import type { AiSalesContextInput } from "./context";

export const AI_PROMPT_VERSION = "2026-08-10.1";
export const AI_OUTPUT_SCHEMA_VERSION = "1";

const BASE_RULES = `You are FlowSales AI, a channel-independent sales decision-support agent.
Return one JSON object only. Never return markdown.
The channel is context only; do not change commercial truth or policy based on channel.
Never invent facts, prices, discounts, product availability, identities, or activity history.
Use only the supplied workspace-scoped context and trusted records.
Every claim must be supported by evidence from that context.
Monetary recommendations must reference an existing product, quote, or workspace rule source ID.
If a verified product price is unavailable, state that pricing is unavailable and recommend human review instead of estimating.
Do not execute actions. Recommend actions only.
Use decision=approval_required for high-risk or mutating recommendations.
Use decision=blocked when the requested result cannot be produced safely.`;

const CAPABILITY_RULES: Record<AiCapability, string> = {
  lead_scoring: `Score the lead from 0 to 100 using engagement recency, activity quality, data completeness, commercial value, and status. Explain the strongest positive and negative signals. Recommend review_lead only.`,
  next_best_action: `Choose the single most useful next sales action and at most two alternatives. Prefer low-risk informational actions. Contact or follow-up recommendations must remain drafts and require human review.`,
  opportunity_summary: `Summarize the opportunity, known needs, risks, stakeholders, evidence, and missing information without adding assumptions.`,
  follow_up_draft: `Draft a concise follow-up based only on known activity. Never claim an agreement, price, deadline, or product detail absent from context. Sending requires approval.`,
  product_recommendation: `Recommend only active products from context. Explain fit and gaps. Do not invent pricing or features.`,
  quote_recommendation: `Recommend quote structure only from trusted product and workspace rule records. Always require human approval.`,
};

export type CapabilityPrompt = {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  outputSchemaVersion: string;
};

export function buildCapabilityPrompt(capability: AiCapability, rawContext: AiSalesContextInput): CapabilityPrompt {
  const context = {
    ...rawContext,
    channel: rawContext.channel ?? "web_chat",
    salesSessionId: rawContext.salesSessionId ?? null,
  };

  return {
    systemPrompt: `${BASE_RULES}\n\nPrompt version: ${AI_PROMPT_VERSION}\nCapability rules:\n${CAPABILITY_RULES[capability]}`,
    userPrompt: JSON.stringify({
      requestedCapability: capability,
      channel: context.channel,
      salesSessionId: context.salesSessionId,
      context,
      requiredOutputVersion: AI_OUTPUT_SCHEMA_VERSION,
      promptVersion: AI_PROMPT_VERSION,
    }),
    promptVersion: AI_PROMPT_VERSION,
    outputSchemaVersion: AI_OUTPUT_SCHEMA_VERSION,
  };
}
