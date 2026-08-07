import { NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { fetchWhatsAppAttachment } from "@/server/services/integrations/whatsapp-media";

interface RouteParams {
  params: Promise<{ attachmentId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { attachmentId } = await params;
  const ctx = await loadWorkspaceContext();
  if (!ctx?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (ctx.mode === "demo") {
    return NextResponse.json({ error: "unavailable_in_demo" }, { status: 403 });
  }

  const result = await fetchWhatsAppAttachment({
    organizationId: ctx.organization.id,
    attachmentId,
  });

  if (!result.success) {
    return NextResponse.json({ error: "media_unavailable", message: result.message }, { status: result.status });
  }

  return new Response(result.bytes, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${result.fileName}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
