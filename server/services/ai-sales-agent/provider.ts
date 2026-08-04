import type { AiCapability, AiSalesAgentOutput } from "./domain";

export type AiGenerationRequest = {
  capability: AiCapability;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

export type AiGenerationResult = {
  output: AiSalesAgentOutput;
  provider: string;
  model: string;
  requestId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly causeCode: "configuration" | "transport" | "invalid_output" | "rate_limit" | "unknown",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }
}
