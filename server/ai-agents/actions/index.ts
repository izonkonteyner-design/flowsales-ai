import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAiEvent, logAiError } from "../logger";
import {
  createQuoteDraftPayloadSchema,
  createLeadDraftPayloadSchema,
  searchKnowledgePayloadSchema,
  classifySupportRequestPayloadSchema,
  trackOrderPayloadSchema,
  alertLowStockPayloadSchema,
  generateDailyReportPayloadSchema,
  suggestContentPayloadSchema,
  planPostSchedulePayloadSchema,
  draftAdCopyPayloadSchema,
} from "../schema";
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

    switch (run.action_type) {
      case "create_quote_draft":
        resultPayload = await executeCreateQuoteDraft(adminClient, workspaceId, userId, run.input_payload);
        break;
      case "create_lead_draft":
        resultPayload = await executeCreateLeadDraft(adminClient, workspaceId, userId, run.input_payload);
        break;
      case "create_followup":
        resultPayload = await executeCreateFollowup(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "search_knowledge":
        resultPayload = await executeSearchKnowledge(adminClient, workspaceId, run.input_payload);
        break;
      case "classify_support_request":
        resultPayload = await executeClassifySupportRequest(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "track_order":
        resultPayload = await executeTrackOrder(adminClient, workspaceId, run.input_payload);
        break;
      case "alert_low_stock":
        resultPayload = await executeAlertLowStock(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "generate_daily_report":
        resultPayload = await executeGenerateDailyReport(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "suggest_content":
        resultPayload = await executeSuggestContent(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "plan_post_schedule":
        resultPayload = await executePlanPostSchedule(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "draft_ad_copy":
        resultPayload = await executeDraftAdCopy(adminClient, workspaceId, userId, run.input_payload, run.conversation_id);
        break;
      case "search_products":
        resultPayload = await executeSearchProducts(adminClient, workspaceId, run.input_payload);
        break;
      default:
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

async function executeSearchProducts(adminClient: SupabaseClient, workspaceId: string, payload: unknown) {
  const query = (payload as { query?: string } | null)?.query?.trim();
  if (!query) {
    throw new Error("search_products requires a query.");
  }
  const { data, error } = await adminClient
    .from("products")
    .select("id, name, unit_price, tax_rate")
    .eq("organization_id", workspaceId)
    .ilike("name", `%${query}%`)
    .limit(10);

  if (error) throw error;
  return { results: data ?? [] };
}

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
  const followupPayload = (
    payload as {
      lead_id?: string;
      due_at_iso?: string;
      message_draft?: string;
    } | null
  );

  if (!followupPayload?.due_at_iso) {
    throw new Error("create_followup requires due_at_iso.");
  }

  const { data: followup, error } = await adminClient
    .from("ai_followups")
    .insert({
      organization_id: workspaceId,
      conversation_id: conversationId,
      lead_id: followupPayload.lead_id ?? null,
      due_at: followupPayload.due_at_iso,
      message_draft: followupPayload.message_draft ?? null,
      created_by: userId,
      status: "pending"
    })
    .select("id")
    .single();

  if (error) throw error;
  return { followup_id: followup.id };
}

async function executeSearchKnowledge(adminClient: SupabaseClient, workspaceId: string, payload: unknown) {
  const parsed = searchKnowledgePayloadSchema.parse(payload);
  const { data, error } = await adminClient
    .from("ai_knowledge_items")
    .select("id, title, content, category")
    .eq("organization_id", workspaceId)
    .eq("is_active", true)
    .or(`title.ilike.%${parsed.query}%,content.ilike.%${parsed.query}%`)
    .limit(10);

  if (error) throw error;
  return { results: data ?? [] };
}

async function executeClassifySupportRequest(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string,
  payload: unknown,
  conversationId: string
) {
  const parsed = classifySupportRequestPayloadSchema.parse(payload);

  // Update the conversation with classification metadata.
  const { error: updateError } = await adminClient
    .from("ai_conversations")
    .update({
      intent: `support:${parsed.category}`,
      sentiment: `severity:${parsed.severity}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("organization_id", workspaceId);

  if (updateError) throw updateError;

  // Record a system message capturing the classification.
  const { error: msgError } = await adminClient.from("ai_messages").insert({
    organization_id: workspaceId,
    conversation_id: conversationId,
    role: "system",
    content: `Ticket classified as ${parsed.category} (severity: ${parsed.severity}). Summary: ${parsed.summary}`,
    metadata: {
      action_type: "classify_support_request",
      category: parsed.category,
      severity: parsed.severity,
      approved_by: userId,
    },
  });

  if (msgError) throw msgError;

  return { category: parsed.category, severity: parsed.severity, summary: parsed.summary };
}

async function executeTrackOrder(adminClient: SupabaseClient, workspaceId: string, payload: unknown) {
  const parsed = trackOrderPayloadSchema.parse(payload);

  // Look up a knowledge item that mentions the order reference.
  const { data, error } = await adminClient
    .from("ai_knowledge_items")
    .select("id, title, content, category")
    .eq("organization_id", workspaceId)
    .eq("is_active", true)
    .or(`title.ilike.%${parsed.order_reference}%,content.ilike.%${parsed.order_reference}%`)
    .limit(1);

  if (error) throw error;

  const match = (data ?? [])[0];
  return {
    order_reference: parsed.order_reference,
    found: Boolean(match),
    status: match ? `Found knowledge entry: ${match.title}` : "No matching order knowledge found.",
    knowledge_id: match?.id ?? null,
  };
}

async function executeAlertLowStock(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string,
  payload: unknown,
  conversationId: string
) {
  const parsed = alertLowStockPayloadSchema.parse(payload);

  // Record the alert as a follow-up so operators can act on it.
  const { data: followup, error } = await adminClient
    .from("ai_followups")
    .insert({
      organization_id: workspaceId,
      conversation_id: conversationId,
      due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      message_draft: `Low stock alert — ${parsed.product_name ?? parsed.product_id ?? "unknown product"} (available: ${parsed.available_units}, threshold: ${parsed.threshold}).`,
      created_by: userId,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw error;

  return {
    followup_id: followup.id,
    product_id: parsed.product_id ?? null,
    product_name: parsed.product_name ?? null,
    available_units: parsed.available_units,
    threshold: parsed.threshold,
  };
}

async function executeGenerateDailyReport(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string,
  payload: unknown,
  conversationId: string
) {
  const parsed = generateDailyReportPayloadSchema.parse(payload);

  // Aggregate quotes issued within the period (defaults to today in workspace timezone).
  const now = new Date();
  const periodStart = parsed.period_start_iso ? new Date(parsed.period_start_iso) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const periodEnd = parsed.period_end_iso ? new Date(parsed.period_end_iso) : now;

  const { data, error } = await adminClient
    .from("quotes")
    .select("id, total, currency, status, created_at")
    .eq("organization_id", workspaceId)
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString());

  if (error) throw error;

  const rows = data ?? [];
  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + Number(row.total ?? 0));
  }

  const totals = Array.from(byCurrency.entries()).map(([currency, total]) => ({ currency, total }));

  let narrative = "";
  try {
    const { generateReportNarrative } = await import("@/server/services/content-generator");
    narrative = await generateReportNarrative({
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      quoteCount: rows.length,
      totals,
    });
  } catch (err) {
    logAiError("report_narrative_failed", err, { workspaceId, conversationId });
    narrative = `${rows.length} quotes issued during ${periodStart.toISOString()} – ${periodEnd.toISOString()}.`;
  }

  const summary = `Daily report for ${periodStart.toISOString()} – ${periodEnd.toISOString()}: ${rows.length} quotes, totals ${JSON.stringify(totals)}. ${narrative}`;

  const { error: msgError } = await adminClient.from("ai_messages").insert({
    organization_id: workspaceId,
    conversation_id: conversationId,
    role: "system",
    content: summary,
    metadata: {
      action_type: "generate_daily_report",
      channel: parsed.channel,
      narrative,
      approved_by: userId,
    },
  });

  if (msgError) throw msgError;

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    quote_count: rows.length,
    totals,
    narrative,
    channel: parsed.channel,
  };
}

async function executeSuggestContent(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string,
  payload: unknown,
  conversationId: string
) {
  const parsed = suggestContentPayloadSchema.parse(payload);

  let ideas: { id: string; platform: string; topic: string; headline: string; rationale: string }[] = [];
  try {
    const { generateContentIdeas } = await import("@/server/services/content-generator");
    ideas = await generateContentIdeas({
      platform: parsed.platform,
      topic: parsed.topic,
      count: parsed.count,
    });
  } catch (err) {
    logAiError("suggest_content_failed", err, { workspaceId, conversationId });
    const buildFallback = (idx: number) => ({
      id: `idea-${idx + 1}`,
      platform: parsed.platform,
      topic: parsed.topic,
      headline: `${parsed.topic} — idea ${idx + 1} for ${parsed.platform}`,
      rationale: `Concept aligned with the ${parsed.platform} audience.`,
    });
    ideas = Array.from({ length: parsed.count }).map((_, idx) => buildFallback(idx));
  }

  const { error: msgError } = await adminClient.from("ai_messages").insert({
    organization_id: workspaceId,
    conversation_id: conversationId,
    role: "system",
    content: `Content suggestions generated (${ideas.length}) for ${parsed.platform} on "${parsed.topic}".`,
    metadata: {
      action_type: "suggest_content",
      platform: parsed.platform,
      ideas,
      approved_by: userId,
    },
  });

  if (msgError) throw msgError;

  return { platform: parsed.platform, topic: parsed.topic, ideas };
}

async function executePlanPostSchedule(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string,
  payload: unknown,
  conversationId: string
) {
  const parsed = planPostSchedulePayloadSchema.parse(payload);

  const scheduled = parsed.slots.map((slot) => ({
    platform: parsed.platform,
    publish_at_iso: slot.publish_at_iso,
    content_hint: slot.content_hint ?? null,
  }));

  const { error: msgError } = await adminClient.from("ai_messages").insert({
    organization_id: workspaceId,
    conversation_id: conversationId,
    role: "system",
    content: `Posting schedule planned for ${parsed.platform} (${scheduled.length} slots).`,
    metadata: {
      action_type: "plan_post_schedule",
      platform: parsed.platform,
      slots: scheduled,
      approved_by: userId,
    },
  });

  if (msgError) throw msgError;

  return { platform: parsed.platform, scheduled };
}

async function executeDraftAdCopy(
  adminClient: SupabaseClient,
  workspaceId: string,
  userId: string,
  payload: unknown,
  conversationId: string
) {
  const parsed = draftAdCopyPayloadSchema.parse(payload);

  let variants: { id: string; platform: string; product_name: string | null; headline: string; body: string | null; cta: string }[] = [];
  try {
    const { generateAdVariants } = await import("@/server/services/content-generator");
    variants = await generateAdVariants({
      platform: parsed.platform,
      productName: parsed.product_name ?? null,
      cta: parsed.cta ?? null,
      variantCount: parsed.variant_count,
    });
  } catch (err) {
    logAiError("draft_ad_copy_failed", err, { workspaceId, conversationId });
    const buildFallback = (idx: number) => ({
      id: `ad-${idx + 1}`,
      platform: parsed.platform,
      product_name: parsed.product_name ?? null,
      headline: `${parsed.product_name ?? "FlowSales"} — ad variant ${idx + 1}`,
      body: null,
      cta: parsed.cta ?? "Learn more",
    });
    variants = Array.from({ length: parsed.variant_count }).map((_, idx) => buildFallback(idx));
  }

  const { error: msgError } = await adminClient.from("ai_messages").insert({
    organization_id: workspaceId,
    conversation_id: conversationId,
    role: "system",
    content: `Ad copy drafted (${variants.length} variants) for ${parsed.platform}.`,
    metadata: {
      action_type: "draft_ad_copy",
      platform: parsed.platform,
      variants,
      approved_by: userId,
    },
  });

  if (msgError) throw msgError;

  return { platform: parsed.platform, variants };
}
