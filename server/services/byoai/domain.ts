import { z } from "zod";

export const byoaiProviderSchema = z.enum(["gemini", "ollama", "custom_local"]);
export type ByoaiProvider = z.infer<typeof byoaiProviderSchema>;

export const byoaiHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "offline",
  "unconfigured",
]);
export type ByoaiHealthStatus = z.infer<typeof byoaiHealthStatusSchema>;

export const workspaceAiSettingsRecordSchema = z.object({
  organizationId: z.string().min(1),
  activeProvider: byoaiProviderSchema,
  geminiModel: z.string().default("gemini-3.5-flash-lite"),
  ollamaBaseUrl: z.string().url().default("http://localhost:11434"),
  ollamaModel: z.string().default("llama3:latest"),
  customLocalEndpoint: z.string().url().nullable().optional(),
  customLocalModel: z.string().nullable().optional(),
  spendingCeilingCents: z.number().int().nonnegative().default(0),
  allowPaidApi: z.boolean().default(false),
  visionCapable: z.boolean().default(true),
  healthStatus: byoaiHealthStatusSchema.default("healthy"),
  lastHealthCheckAt: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});
export type WorkspaceAiSettingsRecord = z.infer<typeof workspaceAiSettingsRecordSchema>;

export const updateWorkspaceAiSettingsInputSchema = z.object({
  activeProvider: byoaiProviderSchema.optional(),
  geminiModel: z.string().optional(),
  ollamaBaseUrl: z.string().url().optional(),
  ollamaModel: z.string().optional(),
  customLocalEndpoint: z.string().url().nullable().optional(),
  customLocalModel: z.string().nullable().optional(),
  spendingCeilingCents: z.number().int().nonnegative().optional(),
  allowPaidApi: z.boolean().optional(),
  visionCapable: z.boolean().optional(),
});
export type UpdateWorkspaceAiSettingsInput = z.infer<typeof updateWorkspaceAiSettingsInputSchema>;

export const byoaiGenerateInputSchema = z.object({
  organizationId: z.string().min(1),
  prompt: z.string().min(1),
  systemInstruction: z.string().optional(),
  temperature: z.number().min(0).max(1).default(0.3).optional(),
  jsonMode: z.boolean().default(false).optional(),
  image: z
    .object({
      base64: z.string(),
      mimeType: z.string(),
    })
    .optional(),
});
export type ByoaiGenerateInput = z.input<typeof byoaiGenerateInputSchema>;

export const byoaiGenerateResultSchema = z.object({
  text: z.string(),
  providerUsed: byoaiProviderSchema,
  modelUsed: string(),
  zeroCostVerified: z.boolean(),
  latencyMs: z.number(),
});
function string() {
  return z.string();
}
export type ByoaiGenerateResult = z.infer<typeof byoaiGenerateResultSchema>;
