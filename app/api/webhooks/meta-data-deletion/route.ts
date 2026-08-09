import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { deleteMetaSubjectData, verifyMetaDeletionSignedRequest } from "@/server/services/integrations/meta-data-deletion";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });
  const subjectId = verifyMetaDeletionSignedRequest(signedRequest);
  if (!subjectId) return Response.json({ error: "invalid_signature" }, { status: 401 });
  try {
    const result = await deleteMetaSubjectData(subjectId);
    const confirmationCode = crypto.createHash("sha256").update(subjectId).digest("hex").slice(0, 24);
    const statusUrl = new URL(`/privacy?deletion_request=${confirmationCode}`, request.url).toString();
    logger.info("meta_data_deletion.completed", { deletedContacts: result.deletedContacts });
    return Response.json({ url: statusUrl, confirmation_code: confirmationCode });
  } catch (error) {
    logger.error("meta_data_deletion.failed", error);
    return Response.json({ error: "deletion_failed" }, { status: 500 });
  }
}
