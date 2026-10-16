import { NextResponse } from "next/server";
import { receiveMessage } from "@/server/services/inbox";
import { z } from "zod";

const webhookSchema = z.object({
  channel: z.enum(["whatsapp", "instagram_dm", "facebook_messenger", "email"]),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  channel_message_id: z.string().min(1),
  channel_conversation_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  sender_name: z.string().min(1),
  sender_phone: z.string().nullable().optional(),
  sender_email: z.string().email().nullable().optional(),
  sender_platform_id: z.string().nullable().optional(),
  content: z.string().min(1),
  media_urls: z.array(z.string().url()).default([]),
  webhook_payload: z.record(z.string(), z.any()).nullable().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const input = webhookSchema.parse(body);

    const result = await receiveMessage(input);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid webhook payload", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, service: "inbox-webhook" });
}