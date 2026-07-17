import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { leadConversionSchema } from "@/lib/validations/lead-conversion";
import {
  buildCustomerInsertFromLead,
  customerMatchesLead,
  loadLiveCustomerById,
} from "@/server/services/crm-integration";
import { canManageLeads } from "@/server/services/lead-domain";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import type { Customer, Lead } from "@/types/crm";

const leadColumns =
  "id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at, converted_customer_id, converted_at, converted_by";
const customerColumns =
  "id, organization_id, full_name, company, email, phone, city, notes, created_by, created_at, updated_at, source_lead_id";

export type LeadConversionResult = {
  lead: Lead;
  customer: Customer;
  state: "created" | "linked" | "existing";
};

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: safeString(row.id),
    organization_id: safeString(row.organization_id),
    full_name: safeString(row.full_name),
    company: safeString(row.company),
    email: safeString(row.email),
    phone: safeString(row.phone),
    city: safeString(row.city),
    source: safeString(row.source),
    status: safeString(row.status) as Lead["status"],
    estimated_value: Number(row.estimated_value ?? 0),
    currency: safeString(row.currency) || "TRY",
    notes: safeString(row.notes),
    assigned_to: safeString(row.assigned_to),
    next_follow_up_at: typeof row.next_follow_up_at === "string" ? row.next_follow_up_at : null,
    created_by: safeString(row.created_by),
    created_at: safeString(row.created_at),
    updated_at: safeString(row.updated_at),
    converted_customer_id: typeof row.converted_customer_id === "string" ? row.converted_customer_id : null,
    converted_at: typeof row.converted_at === "string" ? row.converted_at : null,
    converted_by: typeof row.converted_by === "string" ? row.converted_by : null,
  };
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: safeString(row.id),
    organization_id: safeString(row.organization_id),
    name: safeString(row.full_name),
    company: safeString(row.company),
    email: safeString(row.email),
    phone: safeString(row.phone),
    city: safeString(row.city),
    segment: "Converted",
    lifetime_value: 0,
    last_order_at: null,
    next_review_at: null,
    source_lead_id: typeof row.source_lead_id === "string" ? row.source_lead_id : null,
    converted_at: typeof row.created_at === "string" ? row.created_at : null,
    converted_by: typeof row.created_by === "string" ? row.created_by : null,
  };
}

function toFullCustomerRecord(row: NonNullable<Awaited<ReturnType<typeof loadLiveCustomerById>>>, organizationId: string): Customer {
  return {
    id: row.id,
    organization_id: organizationId,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    city: row.city,
    segment: "Converted",
    lifetime_value: 0,
    last_order_at: null,
    next_review_at: null,
    source_lead_id: row.source_lead_id ?? null,
    converted_at: null,
    converted_by: null,
    quote_count: 0,
    last_quote_at: null,
  };
}

async function loadCustomerRows(client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, organizationId: string) {
  const { data, error } = await client
    .from("contacts")
    .select(customerColumns)
    .eq("organization_id", organizationId);

  if (error || !data) {
    return null;
  }

  return data.map((row) => mapCustomer(row as Record<string, unknown>));
}

export async function convertLeadToCustomerRecord(leadId: string): Promise<LeadConversionResult> {
  const parsed = leadConversionSchema.parse({ lead_id: leadId });
  const context = await getWorkspaceContext();

  if (context.mode === "demo") {
    throw new Error("Lead conversion requires live Supabase data.");
  }

  if (!canManageLeads(context.role)) {
    throw new Error("You do not have permission to convert leads.");
  }

  if (!hasSupabaseConfig()) {
    throw new Error("Lead conversion requires live Supabase data.");
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    throw new Error("Unable to connect to Supabase.");
  }

  const { data: leadData, error: leadError } = await client
    .from("leads")
    .select(leadColumns)
    .eq("id", parsed.lead_id)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (leadError || !leadData) {
    throw new Error("Lead not found.");
  }

  const lead = mapLead(leadData as Record<string, unknown>);

  if (lead.converted_customer_id) {
    const existingCustomer = await loadLiveCustomerById(context.organization.id, lead.converted_customer_id);
    if (existingCustomer) {
      return {
        lead,
        customer: toFullCustomerRecord(existingCustomer, context.organization.id),
        state: "existing",
      };
    }
  }

  const liveCustomers = await loadCustomerRows(client, context.organization.id);
  if (!liveCustomers) {
    throw new Error("Unable to load customers for duplicate detection.");
  }

  const duplicate = liveCustomers.find((candidate) => customerMatchesLead(candidate, lead));
  const customerPayload = buildCustomerInsertFromLead(lead, context.userId, lead.id);
  let createdCustomer: Customer | null = null;
  let createdCustomerId: string | null = null;

  if (duplicate) {
    createdCustomer = duplicate;
  } else {
    const { data: customerData, error: customerError } = await client
      .from("contacts")
      .insert(customerPayload)
      .select(customerColumns)
      .single();

    if (customerError || !customerData) {
      throw new Error(customerError?.message ?? "Unable to create customer.");
    }

    createdCustomerId = customerData.id;
    createdCustomer = mapCustomer(customerData as Record<string, unknown>);
  }

  const conversionTimestamp = new Date().toISOString();
  const updatePayload = {
    converted_customer_id: createdCustomer?.id ?? null,
    converted_at: conversionTimestamp,
    converted_by: context.userId,
  };

  const { data: updatedLeadData, error: updateError } = await client
    .from("leads")
    .update(updatePayload)
    .eq("id", lead.id)
    .eq("organization_id", context.organization.id)
    .select(leadColumns)
    .single();

  if (updateError || !updatedLeadData) {
    if (createdCustomerId) {
      await client.from("contacts").delete().eq("id", createdCustomerId).eq("organization_id", context.organization.id);
    }

    throw new Error(updateError?.message ?? "Unable to update lead conversion.");
  }

  const updatedLead = mapLead(updatedLeadData as Record<string, unknown>);

  let customer: Customer | null = createdCustomer;
  if (!customer && updatedLead.converted_customer_id) {
    const fallbackCustomer = await loadLiveCustomerById(context.organization.id, updatedLead.converted_customer_id);
    customer = fallbackCustomer ? toFullCustomerRecord(fallbackCustomer, context.organization.id) : null;
  }

  if (!customer) {
    throw new Error("Unable to resolve the converted customer.");
  }

  const resolvedCustomer = customer;

  return {
    lead: updatedLead,
    customer: resolvedCustomer,
    state: duplicate ? "linked" : "created",
  };
}
