import "server-only";

import {
  GoogleLeadPayload,
  ParsedGoogleLead,
  parseGoogleLeadPayload,
} from "@/lib/validations/google-lead-ingestion";

export type { GoogleLeadPayload, ParsedGoogleLead };
export { parseGoogleLeadPayload };

export async function processGoogleLeadSubmission(
  rawPayload: unknown,
  workspaceId: string,
  googleWebhookKey?: string
): Promise<{
  success: boolean;
  leadRecord?: {
    workspace_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string;
    notes: string;
  };
  errorMessage?: string;
}> {
  if (!workspaceId) {
    return { success: false, errorMessage: "workspace_id zorunludur." };
  }

  try {
    const parsed = parseGoogleLeadPayload(rawPayload);

    if (googleWebhookKey && parsed.rawPayload.google_key && parsed.rawPayload.google_key !== googleWebhookKey) {
      return { success: false, errorMessage: "Google webhook anahtarı doğrulanamadı." };
    }

    const leadRecord = {
      workspace_id: workspaceId,
      name: parsed.fullName || "Google Lead",
      email: parsed.email || null,
      phone: parsed.phoneNumber || null,
      company: parsed.companyName || null,
      source: "google_ads",
      notes: `Google Form ID: ${parsed.formId}, Campaign: ${parsed.campaignId || "Bilinmiyor"}`,
    };

    return {
      success: true,
      leadRecord,
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : "Geçersiz Google Lead payloadı.",
    };
  }
}
