import { NextResponse } from "next/server";
import { listMessages, updateMessage } from "@/server/services/inbox";
import { z } from "zod";

const filterSchema = z.object({
  channel: z.enum(["whatsapp", "instagram_dm", "facebook_messenger", "email"]).optional(),
  status: z.enum(["new", "read", "replied", "closed", "failed"]).optional(),
  query: z.string().optional(),
  assignedTo: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

const updateSchema = z.object({
  status: z.enum(["new", "read", "replied", "closed", "failed"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  internal_notes: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const filter = filterSchema.parse({
      channel: searchParams.get("channel") || undefined,
      status: searchParams.get("status") || undefined,
      query: searchParams.get("query") || undefined,
      assignedTo: searchParams.get("assigned_to") || undefined,
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "25",
    });

    const result = await listMessages(filter);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
      total: result.total,
      page: filter.page,
      pageSize: filter.pageSize,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid filter parameters", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("id");

    if (!messageId) {
      return NextResponse.json({ error: "Message ID required" }, { status: 400 });
    }

    const body = await request.json();
    const updates = updateSchema.parse(body);

    const result = await updateMessage(messageId, updates);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: result.message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid update parameters", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}