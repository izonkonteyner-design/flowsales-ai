export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  startTime: string | Date;
  endTime: string | Date;
  attendees?: string[];
  location?: string;
  leadId?: string;
  contactId?: string;
  taskId?: string;
  eventId?: string;
  googleEventId?: string;
  timeZone?: string;
  idempotencyKey?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  startTime: string;
  endTime: string;
  attendees: string[];
  location: string | null;
  status: "confirmed" | "cancelled";
  htmlLink: string | null;
};

export function validateCalendarEventInput(input: GoogleCalendarEventInput): { ok: true; data: GoogleCalendarEventInput } | { ok: false; error: string } {
  if (!input.summary || !input.summary.trim()) {
    return { ok: false, error: "Toplantı veya randevu başlığı zorunludur." };
  }

  const start = new Date(input.startTime);
  const end = new Date(input.endTime);

  if (isNaN(start.getTime())) {
    return { ok: false, error: "Geçersiz başlangıç zamanı." };
  }

  if (isNaN(end.getTime())) {
    return { ok: false, error: "Geçersiz bitiş zamanı." };
  }

  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: "Bitiş zamanı başlangıç zamanından sonra olmalıdır." };
  }

  return { ok: true, data: input };
}

export function formatGoogleCalendarEventPayload(input: GoogleCalendarEventInput, organizationId?: string) {
  const startIso = new Date(input.startTime).toISOString();
  const endIso = new Date(input.endTime).toISOString();
  const timeZone = input.timeZone?.trim() || "Europe/Istanbul";

  const privateProps: Record<string, string> = {};
  if (organizationId) {
    privateProps.flowsales_workspace_id = organizationId;
  }
  if (input.leadId) {
    privateProps.flowsales_lead_id = input.leadId;
  }
  if (input.contactId) {
    privateProps.flowsales_contact_id = input.contactId;
  }
  if (input.taskId) {
    privateProps.flowsales_task_id = input.taskId;
  }
  const syncKey =
    input.idempotencyKey ||
    (input.taskId && organizationId ? `task_${organizationId}_${input.taskId}` : "") ||
    (input.leadId && organizationId ? `lead_${organizationId}_${input.leadId}_${startIso}` : "");
  if (syncKey) {
    privateProps.flowsales_sync_key = syncKey;
  }

  return {
    summary: input.summary.trim(),
    description: input.description?.trim() ?? "",
    location: input.location?.trim() ?? "",
    start: {
      dateTime: startIso,
      timeZone,
    },
    end: {
      dateTime: endIso,
      timeZone,
    },
    attendees: (input.attendees ?? []).map((email) => ({ email: email.trim() })),
    ...(Object.keys(privateProps).length > 0
      ? { extendedProperties: { private: privateProps } }
      : {}),
  };
}

export type GoogleLeadFormField = {
  name: string;
  value: string;
};

export type GoogleLeadFormPayload = {
  lead_id: string;
  form_id: string;
  campaign_id?: string;
  google_key?: string;
  user_column_data: GoogleLeadFormField[];
  api_version?: string;
};

export type ParsedGoogleLead = {
  googleLeadId: string;
  formId: string;
  campaignId: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  notes: string | null;
  rawData: Record<string, string>;
};

export function parseGoogleLeadFormSubmission(payload: GoogleLeadFormPayload): ParsedGoogleLead {
  if (!payload.lead_id || !payload.lead_id.trim()) {
    throw new Error("Geçersiz Google Lead payload: 'lead_id' bulunamadı.");
  }

  const rawData: Record<string, string> = {};
  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let companyName: string | null = null;
  let notes: string | null = null;

  if (Array.isArray(payload.user_column_data)) {
    for (const field of payload.user_column_data) {
      if (!field.name || !field.value) continue;
      const key = field.name.toLowerCase().trim();
      const val = field.value.trim();
      rawData[field.name] = val;

      if (key.includes("full_name") || key.includes("name") || key === "ad_soyad") {
        fullName = val;
      } else if (key.includes("email") || key === "eposta") {
        email = val;
      } else if (key.includes("phone") || key.includes("telefon") || key === "phone_number") {
        phone = val;
      } else if (key.includes("company") || key.includes("sirket") || key === "company_name") {
        companyName = val;
      } else if (key.includes("note") || key.includes("not") || key.includes("message")) {
        notes = val;
      }
    }
  }

  return {
    googleLeadId: payload.lead_id.trim(),
    formId: payload.form_id ? payload.form_id.trim() : "unknown_form",
    campaignId: payload.campaign_id ? payload.campaign_id.trim() : null,
    fullName,
    email,
    phone,
    companyName,
    notes,
    rawData,
  };
}

export function validateGoogleWebhookKey(providedKey: string | null | undefined, expectedKey: string): boolean {
  if (!providedKey || !expectedKey) return false;
  return providedKey.trim() === expectedKey.trim();
}

export function mapGoogleLeadToCrmLeadInput(parsed: ParsedGoogleLead, organizationId: string) {
  return {
    organizationId,
    title: parsed.fullName ? `${parsed.fullName} (Google Ads Lead)` : "Google Ads Lead",
    contactName: parsed.fullName ?? "Ads Lead",
    email: parsed.email,
    phone: parsed.phone,
    companyName: parsed.companyName,
    notes: parsed.notes ? `Google Form ID: ${parsed.formId}\n${parsed.notes}` : `Google Form ID: ${parsed.formId}`,
    source: "google_ads",
    sourceId: parsed.googleLeadId,
  };
}

export function assertGoogleAdsReadonlyScope(scopes: string[]): boolean {
  return scopes.some(
    (scope) =>
      scope.includes("adwords") ||
      scope.includes("googleads") ||
      scope.includes("business.manage"),
  );
}
