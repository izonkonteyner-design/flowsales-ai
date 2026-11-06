import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { syncEmailConnection, sendEmail } from "@/server/services/integrations/email-service";
import { determineSafeAutoReply } from "@/server/services/omnichannel-ai-reply";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("cron.email_auto_reply.unauthorized_attempt");
    return NextResponse.json({ success: false, error: "Unauthorized cron trigger" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: connections, error: connectionsError } = await admin
    .from("email_connections")
    .select("id,organization_id,email_address")
    .eq("status", "connected");
  if (connectionsError) return NextResponse.json({ success: false, error: "connections_query_failed" }, { status: 500 });

  let repliedCount = 0;
  let scannedCount = 0;

  for (const connection of connections ?? []) {
    try {
      await syncEmailConnection(connection.organization_id, connection.id);
    } catch (error) {
      logger.error("cron.email_auto_reply.sync_failed", error, { connectionId: connection.id });
      continue;
    }

    const { data: unhandled } = await admin
      .from("email_messages")
      .select("id,thread_id,from_email,subject,body_text,metadata")
      .eq("connection_id", connection.id)
      .eq("organization_id", connection.organization_id)
      .eq("direction", "inbound")
      .is("metadata->>ai_auto_reply_attempted", null)
      .order("sent_at", { ascending: false })
      .limit(20);

    for (const message of unhandled ?? []) {
      scannedCount += 1;
      const body = (message.body_text as string | null)?.trim();
      let decision: { safe: true; reply: string } | { safe: false } = { safe: false };
      if (body) {
        try {
          decision = await determineSafeAutoReply({ organizationId: connection.organization_id, customerMessage: body });
        } catch (error) {
          logger.error("cron.email_auto_reply.decision_failed", error, { messageId: message.id });
        }
      }

      if (decision.safe) {
        try {
          await sendEmail({
            organizationId: connection.organization_id,
            connectionId: connection.id,
            to: message.from_email as string,
            subject: `Re: ${message.subject as string}`,
            body: decision.reply,
          });
          repliedCount += 1;
        } catch (error) {
          logger.error("cron.email_auto_reply.send_failed", error, { messageId: message.id });
          decision = { safe: false };
        }
      }

      await admin.from("email_messages").update({
        metadata: { ...(message.metadata as Record<string, unknown>), ai_auto_reply_attempted: true, ai_auto_replied: decision.safe },
      }).eq("id", message.id).eq("organization_id", connection.organization_id);
    }
  }

  logger.info("cron.email_auto_reply.completed", { connections: connections?.length ?? 0, scannedCount, repliedCount });
  return NextResponse.json({ success: true, connections: connections?.length ?? 0, scannedCount, repliedCount });
}
