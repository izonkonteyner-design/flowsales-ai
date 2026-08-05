import type { NextRequest } from "next/server";
import { z } from "zod";
import { runOAuthGuard, jsonError, jsonOk } from "@/server/services/integrations/oauth-route-guard";
import { WhatsAppEmbeddedSignupService } from "@/server/services/integrations/whatsapp-embedded-signup";
import { verifySameOrigin } from "@/server/services/integrations/origin-guard";
import { checkRateLimit, hashIp } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";

const embeddedSignupSchema = z.object({
  code: z.string().min(1, "Authorization code is required."),
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  businessId: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Same-Origin CSRF Check
  if (!verifySameOrigin(request)) {
    logger.warn("whatsapp.embedded_signup.csrf_mismatch");
    return jsonError(403, "csrf_origin_mismatch", "Cross-site request blocked.");
  }

  // 2. OAuth Route Guard (auth, org, owner/admin role, demo block)
  const guard = await runOAuthGuard(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { ctx } = guard;

  // 3. Rate Limit Check (5 requests per 10 minutes per IP & User)
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
  const rateLimitKey = `signup_${ctx.organizationId}_${ctx.userId}_${hashIp(clientIp)}`;
  const rl = checkRateLimit(rateLimitKey, 5, 600000);
  if (!rl.allowed) {
    logger.warn("whatsapp.embedded_signup.rate_limit_exceeded", { organizationId: ctx.organizationId });
    return jsonError(429, "rate_limit_exceeded", "Too many setup requests. Please try again later.");
  }

  // 4. Request Body Validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Invalid JSON request body.");
  }

  const parseResult = embeddedSignupSchema.safeParse(body);
  if (!parseResult.success) {
    return jsonError(400, "validation_error", parseResult.error.issues[0]?.message || "Invalid request body.");
  }

  const { code, wabaId, phoneNumberId, businessId } = parseResult.data;

  // 5. Process Embedded Signup
  const signupService = new WhatsAppEmbeddedSignupService();
  const result = await signupService.processEmbeddedSignup({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    code,
    wabaId,
    phoneNumberId,
    businessId,
  });

  if (!result.success) {
    return jsonError(400, result.errorCode || "embedded_signup_failed", result.errorMessage || "WhatsApp setup failed.");
  }

  return jsonOk({
    success: true,
    connectionId: result.connectionId,
    status: result.status,
    displayName: result.displayName,
    wabaId: result.wabaId,
    phoneNumberId: result.phoneNumberId,
    displayPhoneNumber: result.displayPhoneNumber,
    verifiedName: result.verifiedName,
    webhookSubscribed: result.webhookSubscribed,
  });
}
