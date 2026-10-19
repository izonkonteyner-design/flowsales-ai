import { z } from "zod";

export const googleColumnDataSchema = z.object({
  column_id: z.string(),
  string_value: z.string().optional(),
});

export const googleLeadPayloadSchema = z.object({
  lead_id: z.string().min(1, "Google Lead ID gerekli"),
  form_id: z.string().min(1, "Google Form ID gerekli"),
  campaign_id: z.string().optional(),
  user_column_data: z.array(googleColumnDataSchema).default([]),
  google_key: z.string().optional(),
});

export type GoogleLeadPayload = z.infer<typeof googleLeadPayloadSchema>;

export type ParsedGoogleLead = {
  googleLeadId: string;
  formId: string;
  campaignId?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  companyName?: string;
  city?: string;
  rawPayload: GoogleLeadPayload;
};

export function parseGoogleLeadPayload(raw: unknown): ParsedGoogleLead {
  const parsed = googleLeadPayloadSchema.parse(raw);

  let fullName: string | undefined;
  let email: string | undefined;
  let phoneNumber: string | undefined;
  let companyName: string | undefined;
  let city: string | undefined;

  for (const col of parsed.user_column_data) {
    const val = col.string_value?.trim();
    if (!val) continue;

    const idLower = col.column_id.toLowerCase();
    if (idLower.includes("company") || idLower.includes("firma") || idLower.includes("sirket")) {
      companyName = val;
    } else if (idLower.includes("email") || idLower.includes("e_mail") || idLower.includes("eposta")) {
      email = val.toLowerCase();
    } else if (idLower.includes("phone") || idLower.includes("tel") || idLower.includes("telefon")) {
      phoneNumber = val;
    } else if (idLower.includes("city") || idLower.includes("sehir") || idLower.includes("il")) {
      city = val;
    } else if (idLower.includes("full_name") || idLower.includes("name") || idLower.includes("ad")) {
      fullName = val;
    }
  }

  return {
    googleLeadId: parsed.lead_id,
    formId: parsed.form_id,
    campaignId: parsed.campaign_id,
    fullName,
    email,
    phoneNumber,
    companyName,
    city,
    rawPayload: parsed,
  };
}
