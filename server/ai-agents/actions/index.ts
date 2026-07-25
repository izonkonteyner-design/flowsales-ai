import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAiEvent, logAiError } from "../logger";
import { z } from "zod";
import { createQuoteDraftPayloadSchema, createLeadDraftPayloadSchema } from "../schema";
import { checkAiRateLimit } from "../rate-limit";

// Action Approval logic
export async function executeAiAction(
  workspaceId: string,
  userId: string,
  actionRunId: string,
  demoMode: boolean
) {
  const isRateLimitOk = await checkAiRateLimit(workspaceId, "action_approval");
  if (!isRateLimitOk) {
    throw new Error("Rate limit exceeded for approvals.");
  }

  if (demoMode) {
    throw new Error("Mutations are strictly prohibited in Demo Mode.");
  }

  const adminClient = createSupabaseAdminClient();

  // 1. Fetch action run
  const { data: run, error: runError } = await adminClient
    .from("ai_action_runs")
    .select("*")
    .eq("id", actionRunId)
    .eq("organization_id", workspaceId)
    .single();

  if (runError || !run) {
    throw new Error("Action run not found or unauthorized");
  }

  if (run.status !== "proposed") {
    throw new Error("Action is not in a proposable state or already approved.");
  }

  // 2. Route action
  try {
    let resultPayload = null;

    if (run.action_type === "create_quote_draft") {
      resultPayload = await executeCreateQuoteDraft(adminClient, workspaceId, userId, run.input_payload);
    } else if (run.action_type === "create_lead_draft") {
      resultPayload = await executeCreateLeadDraft(adminClient, workspaceId, userId, run.input_payload);
    } else if (run.action_type === "create_followup") {
      resultPayload = await executeCreateFollowup(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
    } else {
      throw new Error(`Unsupported action type for execution: ${run.action_type}`);
    }

    // 3. Update status
    await adminClient
      .from("ai_action_runs")
      .update({
        status: "approved",
        approved_by: userId,
        output_payload: resultPayload,
        completed_at: new Date().toISOString()
      })
      .eq("id", actionRunId);

    logAiEvent("action_approved", { workspaceId, actionRunId, type: run.action_type });
    return { success: true, payload: resultPayload };

  } catch (error) {
    logAiError("action_execution_failed", error, { workspaceId, actionRunId });
    await adminClient
      .from("ai_action_runs")
      .update({
        status: "failed",
        error_code: error instanceof Error ? error.message : "Unknown error",
        completed_at: new Date().toISOString()
      })
      .eq("id", actionRunId);
    throw error;
  }
}

// Implementations for execution

type DbProduct = {
  id: string;
  name: string;
  unit_price: number;
  tax_rate: number;
};

async function executeCreateQuoteDraft(adminClient: SupabaseClient, workspaceId: string, userId: string, payload: unknown) {
  const parsed = createQuoteDraftPayloadSchema.parse(payload);

  if (parsed.items.length === 0) {
    throw new Error("Quote must have at least one item.");
  }

  const productIds = parsed.items.map(i => i.product_id);
  const { data: products, error: productsError } = await adminClient
    .from("products")
    .select("id, name, unit_price, tax_rate")
    .eq("organization_id", workspaceId)
    .in("id", productIds);

  if (productsError || !products || products.length === 0) {
    throw new Error("Failed to load products or products do not belong to workspace.");
  }

  const productsById = new Map<string, DbProduct>(products.map((p: DbProduct) => [p.id, p]));

  let subtotal = 0;
  let taxTotal = 0;

  const quoteItemsToInsert = parsed.items.map(item => {
    const product = productsById.get(item.product_id);
    if (!product) {
      throw new Error(`Product ${item.product_id} not found in workspace.`);
    }

    const lineTotal = product.unit_price * item.quantity;
    const taxLine = lineTotal * (product.tax_rate / 100);

    subtotal += lineTotal;
    taxTotal += taxLine;

    return {
      product_id: product.id,
      description: product.name,
      quantity: item.quantity,
      unit_price: product.unit_price,
      discount: 0,
      tax_rate: product.tax_rate,
      line_total: lineTotal
    };
  });

  const total = subtotal + taxTotal;
  const quoteNumber = `Q-AI-${Date.now().toString().slice(-6)}`;

  if (!parsed.lead_id) {
    throw new Error("Lead ID is required to generate a quote.");
  }

  const { data: quote, error: quoteError } = await adminClient
    .from("quotes")
    .insert({
      organization_id: workspaceId,
      lead_id: parsed.lead_id,
      quote_number: quoteNumber,
      issue_date: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      status: "draft",
      currency: "TRY",
      notes: parsed.notes,
      subtotal,
      discount_total: 0,
      tax_total: taxTotal,
      total,
      created_by: userId
    })
    .select("id")
    .single();

  if (quoteError) throw quoteError;

  const itemsWithQuoteId = quoteItemsToInsert.map(i => ({ ...i, quote_id: quote.id }));
  const { error: itemsError } = await adminClient.from("quote_items").insert(itemsWithQuoteId);

  if (itemsError) throw itemsError;

  return { quote_id: quote.id, quote_number: quoteNumber, total };
}

async function executeCreateLeadDraft(adminClient: SupabaseClient, workspaceId: string, userId: string, payload: unknown) {
  const parsed = createLeadDraftPayloadSchema.parse(payload);

  const { data: lead, error } = await adminClient
    .from("leads")
    .insert({
      organization_id: workspaceId,
      full_name: parsed.full_name,
      email: parsed.email,
      phone: parsed.phone,
      company: parsed.company,
      notes: parsed.notes,
      source: "AI Agent",
      status: "new",
      created_by: userId
    })
    .select("id")
    .single();

  if (error) throw error;
  return { lead_id: lead.id };
}

async function executeCreateFollowup(adminClient: SupabaseClient, workspaceId: string, userId: string, payload: unknown, conversationId: string) {
  const parsed = z.object({
    lead_id: z.string().uuid().optional(),
    due_at_iso: z.string().datetime(),
    message_draft: z.string().optional(),
  }).parse(payload);

  const { data: followup, error } = await adminClient
    .from("ai_followups")
    .insert({
      organization_id: workspaceId,
      conversation_id: conversationId,
      lead_id: parsed.lead_id,
      due_at: parsed.due_at_iso,
      message_draft: parsed.message_draft,
      created_by: userId,
      status: "pending"
    })
    .select("id")
    .single();

  if (error) throw error;
  return { followup_id: followup.id };
}

