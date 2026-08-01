import type { AiSalesContext } from "./context";
import type { AiCapability, AiSalesAgentOutput } from "./domain";
import { buildCapabilityPrompt } from "./prompts";
import type { AiProvider } from "./provider";

export type AiCapabilityServiceResult = {
  output: AiSalesAgentOutput;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

async function runCapability(
  provider: AiProvider,
  capability: AiCapability,
  context: AiSalesContext,
): Promise<AiCapabilityServiceResult> {
  const prompt = buildCapabilityPrompt(capability, context);
  const result = await provider.generate({
    capability,
    ...prompt,
    temperature: capability === "lead_scoring" ? 0.1 : capability === "quote_recommendation" ? 0.1 : 0.2,
  });

  return {
    output: result.output,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
  };
}

export function scoreLead(provider: AiProvider, context: AiSalesContext) {
  return runCapability(provider, "lead_scoring", context);
}

export function recommendNextBestAction(provider: AiProvider, context: AiSalesContext) {
  return runCapability(provider, "next_best_action", context);
}

export function summarizeOpportunity(provider: AiProvider, context: AiSalesContext) {
  return runCapability(provider, "opportunity_summary", context);
}

export function draftFollowUp(provider: AiProvider, context: AiSalesContext) {
  return runCapability(provider, "follow_up_draft", context);
}

export function recommendProducts(provider: AiProvider, context: AiSalesContext) {
  return runCapability(provider, "product_recommendation", context);
}

export function recommendQuote(provider: AiProvider, context: AiSalesContext) {
  return runCapability(provider, "quote_recommendation", context);
}

export function runAiCapability(provider: AiProvider, capability: AiCapability, context: AiSalesContext) {
  return runCapability(provider, capability, context);
}
