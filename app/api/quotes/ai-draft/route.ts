import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import {
  createQuoteAiServiceError,
  getQuoteAiPublicErrorMessage,
  quoteAiErrorMessages,
  quoteAiDraftRequestSchema,
  type QuoteAiDraftInput,
  type QuoteAiDraftRequest,
  type QuoteAiErrorCode,
} from "@/lib/validations/quote-ai";
import { hasGeminiConfig } from "@/server/services/ai";
import { finalizeQuoteAiUsage, reserveQuoteAiUsage } from "@/server/services/ai-usage";
import { loadQuoteRecipientResolution } from "@/server/services/crm-integration";
import { generateQuoteAiDraft } from "@/server/services/ai-quote-assistant";
import { canManageQuotes } from "@/server/services/quote-domain";
import type { Organization } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inFlightRequests = new Set<string>();
type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

type WorkspaceLimits = {
  workspacePrompt: string | null;
  temperature: number;
};

function logQuoteAiRouteDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[quote-ai] ${event}`, details);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: String(error) };
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getErrorCode(error: unknown): QuoteAiErrorCode {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code in quoteAiErrorMessages) {
      return code as QuoteAiErrorCode;
    }
  }

  if (error instanceof Error && /Gemini is not configured/i.test(error.message)) {
    return "ai_not_configured";
  }

  if (error instanceof Error && /already being generated/i.test(error.message)) {
    return "concurrent_request";
  }

  if (error instanceof Error && /usage limit/i.test(error.message)) {
    return "usage_limit_reached";
  }

  if (error instanceof Error && /Unauthorized|signed in|session/i.test(error.message)) {
    return "unauthorized";
  }

  if (error instanceof Error && /workspace|organization|product|customer|lead/i.test(error.message)) {
    return "workspace_access_error";
  }

  return "temporary_failure";
}

function getStatusForCode(code: QuoteAiErrorCode) {
  switch (code) {
    case "ai_not_configured":
      return 503;
    case "unauthorized":
      return 401;
    case "workspace_access_error":
      return 403;
    case "usage_limit_reached":
      return 429;
    case "validation_error":
      return 400;
    case "concurrent_request":
      return 409;
    case "temporary_failure":
    default:
      return 502;
  }
}

async function loadWorkspaceLimits(client: SupabaseServerClient, organizationId: string): Promise<WorkspaceLimits> {
  const { data } = await client
    .from("ai_agent_settings")
    .select("system_prompt, temperature")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return {
    workspacePrompt: typeof data?.system_prompt === "string" && data.system_prompt.trim() ? data.system_prompt.trim() : null,
    temperature: typeof data?.temperature === "number" && Number.isFinite(data.temperature) ? data.temperature : 0.2,
  };
}

function mapRequestItemsToAuthoritativeItems(
  request: QuoteAiDraftRequest,
  productLookup: Map<string, { id: string; name: string; sku: string | null; unit: string | null; currency: string; unit_price: number | null; base_price: number | null; tax_rate: number | null; }>,
) {
  return request.items.map((item) => {
    if (!item.product_id) {
      return {
        name: item.name,
        sku: asOptionalString(item.sku),
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unit_price,
        taxRate: item.tax_rate,
      };
    }

    const product = productLookup.get(item.product_id);
    if (!product) {
      throw createQuoteAiServiceError("workspace_access_error", 403);
    }

    return {
      name: product.name,
      sku: asOptionalString(product.sku),
      quantity: item.quantity,
      unit: product.unit ?? item.unit,
      unitPrice: Number(product.unit_price ?? product.base_price ?? item.unit_price ?? 0),
      taxRate: Number(product.tax_rate ?? item.tax_rate ?? 0),
    };
  });
}

function mapRecipientToCustomer(
  recipient:
    | {
        lead: {
          full_name?: string | null;
          company?: string | null;
          city?: string | null;
          notes?: string | null;
        } | null;
        customer: {
          name?: string | null;
          company?: string | null;
          city?: string | null;
          notes?: string | null;
        } | null;
      }
    | null,
) {
  const source = recipient?.customer ?? recipient?.lead;
  if (!source) {
    throw createQuoteAiServiceError("workspace_access_error", 403);
  }

  return {
    name: asOptionalString((source as { name?: string | null; full_name?: string | null }).name ?? (source as { name?: string | null; full_name?: string | null }).full_name) ?? "",
    company: asOptionalString(source.company),
    city: asOptionalString(source.city),
    notes: asOptionalString(source.notes),
  };
}

function buildAuthoritativeInput(
  request: QuoteAiDraftRequest,
  organization: Organization,
  recipient: NonNullable<Awaited<ReturnType<typeof loadQuoteRecipientResolution>>>,
  authoritativeItems: Awaited<ReturnType<typeof mapRequestItemsToAuthoritativeItems>>,
): QuoteAiDraftInput {
  return {
    organization: {
      name: organization.name,
      industry: null,
      city: asOptionalString(organization.city),
      defaultPaymentTerms: asOptionalString(organization.default_payment_terms),
      defaultDeliveryTerms: asOptionalString(organization.default_delivery_terms),
    },
    customer: mapRecipientToCustomer(recipient),
    quote: {
      currency: request.quoteCurrency,
      issueDate: asOptionalString(request.issueDate),
      expiryDate: asOptionalString(request.expiryDate),
    },
    items: authoritativeItems,
    userInstruction: asOptionalString(request.userInstruction),
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("ai_not_configured"),
      },
      { status: 503 },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("validation_error"),
      },
      { status: 400 },
    );
  }

  const parsedRequest = quoteAiDraftRequestSchema.safeParse(parsedBody);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("validation_error"),
      },
      { status: 400 },
    );
  }

  const requestBody = parsedRequest.data;
  if (!requestBody.leadId && !requestBody.customerId) {
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("validation_error"),
      },
      { status: 400 },
    );
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("ai_not_configured"),
      },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    logQuoteAiRouteDiagnostic("auth failure", {
      supabaseError: serializeError(userError),
      returnedAuthError: getQuoteAiPublicErrorMessage("unauthorized"),
    });
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("unauthorized"),
      },
      { status: 401 },
    );
  }

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    logQuoteAiRouteDiagnostic("workspace membership lookup error", {
      supabaseError: serializeError(membershipError),
      returnedAuthError: getQuoteAiPublicErrorMessage("unauthorized"),
      userId: user.id,
    });
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("unauthorized"),
      },
      { status: 401 },
    );
  }

  if (!canManageQuotes(membership.role)) {
    logQuoteAiRouteDiagnostic("workspace permission denied", {
      organizationId: membership.organization_id,
      userId: user.id,
      role: membership.role,
      returnedAuthError: getQuoteAiPublicErrorMessage("workspace_access_error"),
    });
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("workspace_access_error"),
      },
      { status: 403 },
    );
  }

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select(
      "id, name, slug, currency, logo_url, logo_path, legal_name, website, email, phone, secondary_phone, address_line_1, address_line_2, district, city, postal_code, country, tax_office, tax_number, trade_registry_number, mersis_number, bank_name, bank_branch, iban, account_holder, default_tax_rate, default_payment_terms, default_delivery_terms, default_quote_notes, default_quote_validity_days, quote_footer_text, signature_name, signature_title, company_slogan",
    )
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (organizationError || !organization) {
    logQuoteAiRouteDiagnostic("organization lookup error", {
      supabaseError: serializeError(organizationError),
      organizationId: membership.organization_id,
      returnedAuthError: getQuoteAiPublicErrorMessage("workspace_access_error"),
    });
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("workspace_access_error"),
      },
      { status: 403 },
    );
  }

  const limits = await loadWorkspaceLimits(client, organization.id);

  const requestKey = `${user.id}:${requestBody.formId}`;
  if (inFlightRequests.has(requestKey)) {
    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage("concurrent_request"),
      },
      { status: 409 },
    );
  }

  inFlightRequests.add(requestKey);

  let usageEventId: string | null = null;

  try {
    const recipient = await loadQuoteRecipientResolution(organization.id, requestBody.leadId ?? null, requestBody.customerId ?? null);
    if (!recipient.lead && !recipient.customer) {
      throw createQuoteAiServiceError("workspace_access_error", 403);
    }

    const productIds = [...new Set(requestBody.items.map((item) => item.product_id).filter((item): item is string => Boolean(item)))];
    const productLookup = new Map<string, { id: string; name: string; sku: string | null; unit: string | null; currency: string; unit_price: number | null; base_price: number | null; tax_rate: number | null }>();

    if (productIds.length > 0) {
      const { data: products, error: productError } = await client
        .from("products")
        .select("id, name, sku, unit, currency, unit_price, base_price, tax_rate, organization_id")
        .eq("organization_id", organization.id)
        .in("id", productIds);

      if (productError) {
        throw createQuoteAiServiceError("workspace_access_error", 403);
      }

      for (const product of products ?? []) {
        productLookup.set(product.id, product);
      }

      if (productLookup.size !== productIds.length) {
        throw createQuoteAiServiceError("workspace_access_error", 403);
      }
    }

    const authoritativeItems = mapRequestItemsToAuthoritativeItems(requestBody, productLookup);
    const input = buildAuthoritativeInput(requestBody, organization as Organization, recipient, authoritativeItems);

    if (!hasGeminiConfig()) {
      return NextResponse.json(
        {
          success: false,
          message: getQuoteAiPublicErrorMessage("ai_not_configured"),
        },
        { status: 503 },
      );
    }

    const reservation = await reserveQuoteAiUsage(client, organization.id);
    usageEventId = reservation.usageEventId;

    const draft = await generateQuoteAiDraft(input, {
      temperature: limits.temperature,
      workspacePrompt: limits.workspacePrompt,
    });

    if (usageEventId) {
      try {
        await finalizeQuoteAiUsage(client, usageEventId, "succeeded");
      } catch (finalizeError) {
        logQuoteAiRouteDiagnostic("usage finalization failure", {
          usageEventId,
          supabaseError: serializeError(finalizeError),
          organizationId: organization.id,
          userId: user.id,
        });
      } finally {
        usageEventId = null;
      }
    }

    return NextResponse.json({
      success: true,
      draft,
    });
  } catch (error) {
    if (usageEventId) {
      try {
        await finalizeQuoteAiUsage(client, usageEventId, "failed");
      } catch (finalizeError) {
        logQuoteAiRouteDiagnostic("usage finalization failure", {
          usageEventId,
          supabaseError: serializeError(finalizeError),
          organizationId: organization.id,
          userId: user.id,
        });
      }
    }

    const code = error instanceof Error && "code" in error ? (error as { code?: QuoteAiErrorCode }).code ?? getErrorCode(error) : getErrorCode(error);
    const status = error instanceof Error && "status" in error ? (error as { status?: number }).status ?? getStatusForCode(code) : getStatusForCode(code);

    logQuoteAiRouteDiagnostic("draft generation failure", {
      code,
      status,
      supabaseError: serializeError(error),
      organizationId: organization.id,
      userId: user.id,
      formId: requestBody.formId,
    });

    return NextResponse.json(
      {
        success: false,
        message: getQuoteAiPublicErrorMessage(code),
      },
      { status },
    );
  } finally {
    inFlightRequests.delete(requestKey);
  }
}
