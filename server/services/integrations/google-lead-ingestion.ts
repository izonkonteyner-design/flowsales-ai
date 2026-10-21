import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
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
    id?: string;
    workspace_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string;
    notes: string;
  };
  deduplicated?: boolean;
  errorMessage?: string;
}> {
  if (!workspaceId) {
    return { success: false, errorMessage: "workspace_id zorunludur." };
  }

  try {
    const parsed = parseGoogleLeadPayload(rawPayload);

    if (googleWebhookKey) {
      const providedKey = parsed.rawPayload.google_key?.trim();
      if (!providedKey || providedKey !== googleWebhookKey.trim()) {
        return { success: false, errorMessage: "Google webhook anahtarı doğrulanamadı." };
      }
    }

    const admin = createSupabaseAdminClient();

    // Check for existing duplicate lead by email
    if (parsed.email) {
      const { data: existing } = await admin
        .from("leads")
        .select("id, contact_name, email")
        .eq("organization_id", workspaceId)
        .eq("email", parsed.email)
        .maybeSingle();

      if (existing) {
        return {
          success: true,
          deduplicated: true,
          leadRecord: {
            id: existing.id,
            workspace_id: workspaceId,
            name: existing.contact_name || "Google Lead",
            email: existing.email,
            phone: parsed.phoneNumber || null,
            company: parsed.companyName || null,
            source: "google_ads",
            notes: `Mevcut lead eşleşti (Google Form ID: ${parsed.formId})`,
          },
        };
      }
    }

    // Insert new CRM lead
    const leadInsert = {
      organization_id: workspaceId,
      title: parsed.fullName ? `${parsed.fullName} (Google Ads)` : "Google Ads Lead",
      contact_name: parsed.fullName || "Google Lead",
      email: parsed.email || null,
      phone: parsed.phoneNumber || null,
      company_name: parsed.companyName || null,
      source: "google_ads",
      status: "new_lead",
      notes: `Google Form ID: ${parsed.formId}, Campaign: ${parsed.campaignId || "Bilinmiyor"}`,
    };

    const { data: inserted, error: insertError } = await admin
      .from("leads")
      .insert(leadInsert)
      .select("id")
      .single();

    if (insertError && insertError.code !== "23505") {
      return {
        success: false,
        errorMessage: `Lead veritabanına kaydedilemedi: ${insertError.message}`,
      };
    }

    return {
      success: true,
      deduplicated: false,
      leadRecord: {
        id: inserted?.id ?? `glead_${parsed.googleLeadId}`,
        workspace_id: workspaceId,
        name: leadInsert.contact_name,
        email: leadInsert.email,
        phone: leadInsert.phone,
        company: leadInsert.company_name,
        source: leadInsert.source,
        notes: leadInsert.notes,
      },
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : "Geçersiz Google Lead payloadı.",
    };
  }
}
