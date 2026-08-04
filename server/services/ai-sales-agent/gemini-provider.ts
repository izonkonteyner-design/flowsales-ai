import { GoogleGenAI } from "@google/genai";

import { parseAiSalesAgentOutput } from "./domain";
import { AiProviderError, type AiGenerationRequest, type AiGenerationResult, type AiProvider } from "./provider";

export type GeminiProviderOptions = {
  apiKey?: string;
  model?: string;
};

export class GeminiAiProvider implements AiProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new AiProviderError("GEMINI_API_KEY is not configured.", "configuration");
    }

    this.client = new GoogleGenAI({ apiKey });
    this.model = options.model?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.userPrompt,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: request.temperature ?? 0.2,
          responseMimeType: "application/json",
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new AiProviderError("Gemini returned an empty response.", "invalid_output");
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch (error) {
        throw new AiProviderError("Gemini returned invalid JSON.", "invalid_output", { cause: error });
      }

      let output;
      try {
        output = parseAiSalesAgentOutput(decoded);
      } catch (error) {
        throw new AiProviderError("Gemini output failed schema validation.", "invalid_output", { cause: error });
      }

      if (output.capability !== request.capability) {
        throw new AiProviderError("Gemini returned the wrong capability.", "invalid_output");
      }

      return {
        output,
        provider: this.name,
        model: this.model,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown Gemini error";
      const causeCode = /429|rate.?limit|quota/i.test(message) ? "rate_limit" : "transport";
      throw new AiProviderError("Gemini generation failed.", causeCode, { cause: error });
    }
  }
}
