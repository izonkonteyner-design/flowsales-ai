import type { NextRequest } from "next/server";
import { z } from "zod";
import { runOAuthGuard, jsonError, jsonOk } from "@/server/services/integrations/oauth-route-guard";
import { WhatsAppEmbeddedSignupService } from "@/server/services/integrations/whatsapp-embedded-signup";

const embeddedSignupSchema = z.object({
  code: z.string().min(1, "Authorization code is required").max(1024, "Invalid code length"),
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  businessId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // 1. Authentication, workspace, owner/admin, demo block guard
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  // 2. Content-Type check
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }

  // 3. Body validation
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Invalid JSON payload.");
  }

  const parseResult = embeddedSignupSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonError(400, "validation_error", parseResult.error.issues[0]?.message || "Invalid request body.");
  }

  const { code, wabaId, phoneNumberId, businessId } = parseResult.data;

  // 4. Process Embedded Signup code exchange & connection setup
  const service = new WhatsAppEmbeddedSignupService();
  const result = await service.processEmbeddedSignup({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    code,
    wabaId,
    phoneNumberId,
    businessId,
  });

  if (!result.success) {
    const status = result.errorCode === 'configuration_required' || result.errorCode === 'token_encryption_not_configured'
      ? 503
      : result.errorCode === 'waba_already_connected_to_another_workspace'
      ? 409
      : 400;

    return jsonError(status, result.errorCode || 'embedded_signup_failed', result.errorMessage || 'Failed to complete WhatsApp signup.');
  }

  return jsonOk({
    success: true,
    status: result.status,
    connectionId: result.connectionId,
    displayName: result.displayName,
    wabaId: result.wabaId,
    phoneNumberId: result.phoneNumberId,
    displayPhoneNumber: result.displayPhoneNumber,
    verifiedName: result.verifiedName,
    webhookSubscribed: result.webhookSubscribed,
  });
}
