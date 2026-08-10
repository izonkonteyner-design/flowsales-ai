import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { voiceInboundEventSchema, type VoiceCallContext, type VoiceChannelAdapter, type VoiceInboundEvent } from "./adapter";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

type TelnyxEnvelope = {
  data?: { id?: string; event_type?: string; occurred_at?: string; payload?: Record<string, unknown> };
};

function requiredEnv(name: "TELNYX_API_KEY" | "TELNYX_PUBLIC_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function command(callControlId: string, action: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredEnv("TELNYX_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telnyx ${action} failed with ${response.status}.`);
}

async function resolveCallContext(payload: Record<string, unknown>, state: VoiceCallContext["state"]): Promise<VoiceCallContext | null> {
  const admin = createSupabaseAdminClient();
  const providerCallId = String(payload.call_control_id ?? "");
  const to = String(payload.to ?? "");
  const from = String(payload.from ?? "");
  if (!providerCallId) return null;

  const { data: existing } = await admin.from("voice_calls").select("organization_id,sales_session_id,direction,from_number,to_number").eq("provider", "telnyx").eq("provider_call_id", providerCallId).maybeSingle();
  if (existing) {
    return { provider: "telnyx", providerCallId, workspaceId: existing.organization_id, salesSessionId: existing.sales_session_id, direction: existing.direction, from: existing.from_number, to: existing.to_number, state };
  }

  if (!to) return null;
  const { data: connection } = await admin.from("voice_provider_connections").select("organization_id").eq("provider", "telnyx").eq("phone_number", to).eq("status", "connected").maybeSingle();
  if (!connection) return null;
  return { provider: "telnyx", providerCallId, workspaceId: connection.organization_id, salesSessionId: crypto.randomUUID(), direction: "inbound", from: from || "unknown", to, state };
}

export class TelnyxVoiceAdapter implements VoiceChannelAdapter {
  readonly provider = "telnyx";

  async verifyWebhook(input: { rawBody: string; headers: Headers }) {
    const signature = input.headers.get("telnyx-signature-ed25519");
    const timestamp = input.headers.get("telnyx-timestamp");
    if (!signature || !timestamp) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
    try {
      return crypto.verify(null, Buffer.from(`${timestamp}|${input.rawBody}`), requiredEnv("TELNYX_PUBLIC_KEY"), Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  }

  async parseInboundEvent(input: { rawBody: string; headers: Headers }): Promise<VoiceInboundEvent | null> {
    let envelope: TelnyxEnvelope;
    try { envelope = JSON.parse(input.rawBody) as TelnyxEnvelope; } catch { return null; }
    const eventType = envelope.data?.event_type;
    const payload = envelope.data?.payload ?? {};
    const providerEventId = envelope.data?.id ?? null;
    const callControlId = String(payload.call_control_id ?? "");
    if (!eventType || !callControlId) return null;

    if (eventType === "call.initiated") {
      const call = await resolveCallContext(payload, "ringing");
      return call ? voiceInboundEventSchema.parse({ type: "call_started", call, providerEventId }) : null;
    }
    if (eventType === "call.answered") {
      const call = await resolveCallContext(payload, "answered");
      return call ? voiceInboundEventSchema.parse({ type: "call_answered", call, providerEventId }) : null;
    }
    if (eventType === "call.transcription") {
      const transcription = (payload.transcription_data ?? {}) as Record<string, unknown>;
      if (transcription.is_final !== true || !String(transcription.transcript ?? "").trim()) return null;
      const call = await resolveCallContext(payload, "speaking");
      return call ? voiceInboundEventSchema.parse({ type: "speech_final", call, transcript: String(transcription.transcript), providerEventId }) : null;
    }
    if (eventType === "call.hangup") {
      const call = await resolveCallContext(payload, "completed");
      return call ? voiceInboundEventSchema.parse({ type: "call_ended", call, reason: String(payload.hangup_cause ?? "hangup"), providerEventId }) : null;
    }
    return null;
  }

  answerCall(call: VoiceCallContext) { return command(call.providerCallId, "answer"); }
  async speak(call: VoiceCallContext, text: string) { await command(call.providerCallId, "speak", { payload: text.slice(0, 3000), voice: process.env.TELNYX_TTS_VOICE?.trim() || "female", language: "tr-TR", command_id: crypto.randomUUID() }); }
  async stopSpeaking(call: VoiceCallContext) { await command(call.providerCallId, "playback_stop", { stop: "all", command_id: crypto.randomUUID() }); }
  async transferCall(call: VoiceCallContext, destination: string) { await command(call.providerCallId, "transfer", { to: destination, command_id: crypto.randomUUID() }); }
  hangup(call: VoiceCallContext) { return command(call.providerCallId, "hangup", { command_id: crypto.randomUUID() }); }
  startTranscription(call: VoiceCallContext) { return command(call.providerCallId, "transcription_start", { transcription_engine: "Google", transcription_tracks: "inbound", transcription_engine_config: { transcription_engine: "Google", language: "tr-TR" }, command_id: crypto.randomUUID() }); }
}
