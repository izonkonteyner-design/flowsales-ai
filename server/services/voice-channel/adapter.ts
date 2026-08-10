import { z } from "zod";

export const voiceCallDirectionSchema = z.enum(["inbound", "outbound"]);
export const voiceCallStateSchema = z.enum(["ringing", "answered", "speaking", "transferring", "completed", "failed"]);

export const voiceCallContextSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  providerCallId: z.string().trim().min(1).max(240),
  workspaceId: z.string().uuid(),
  salesSessionId: z.string().uuid(),
  direction: voiceCallDirectionSchema,
  from: z.string().trim().min(3).max(80),
  to: z.string().trim().min(3).max(80),
  state: voiceCallStateSchema,
});

export type VoiceCallContext = z.infer<typeof voiceCallContextSchema>;

export const voiceInboundEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call_started"), call: voiceCallContextSchema }),
  z.object({ type: z.literal("speech_final"), call: voiceCallContextSchema, transcript: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("call_ended"), call: voiceCallContextSchema, reason: z.string().trim().max(500).nullable() }),
  z.object({ type: z.literal("provider_error"), call: voiceCallContextSchema, code: z.string().trim().max(120), message: z.string().trim().max(500) }),
]);

export type VoiceInboundEvent = z.infer<typeof voiceInboundEventSchema>;

export interface VoiceChannelAdapter {
  readonly provider: string;
  verifyWebhook(input: { rawBody: string; headers: Headers }): Promise<boolean>;
  parseInboundEvent(input: { rawBody: string; headers: Headers }): Promise<VoiceInboundEvent | null>;
  answerCall(call: VoiceCallContext): Promise<void>;
  speak(call: VoiceCallContext, text: string): Promise<void>;
  transferCall(call: VoiceCallContext, destination: string): Promise<void>;
  hangup(call: VoiceCallContext): Promise<void>;
}

export class VoiceAdapterRegistry {
  private readonly adapters = new Map<string, VoiceChannelAdapter>();

  register(adapter: VoiceChannelAdapter) {
    const key = adapter.provider.trim().toLowerCase();
    if (!key) throw new Error("Voice provider name is required.");
    if (this.adapters.has(key)) throw new Error(`Voice adapter already registered: ${key}`);
    this.adapters.set(key, adapter);
  }

  get(provider: string) {
    const adapter = this.adapters.get(provider.trim().toLowerCase());
    if (!adapter) throw new Error(`Voice provider is not configured: ${provider}`);
    return adapter;
  }

  has(provider: string) {
    return this.adapters.has(provider.trim().toLowerCase());
  }
}
