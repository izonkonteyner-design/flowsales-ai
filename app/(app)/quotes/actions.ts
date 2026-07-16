"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { quoteFormSchema, type QuoteFormInput } from "@/lib/validations/quote";
import {
  changeQuoteStatusRecord,
  createQuoteRecord,
  deleteQuoteRecord,
  updateQuoteRecord,
} from "@/server/services/quotes";
import { QUOTE_STATUSES } from "@/lib/constants";
import type { Quote } from "@/types/crm";

function safeRedirectTarget(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" && value.startsWith("/") ? value : fallback;
}

function redirectWithToast(target: string, message: string, tone: "success" | "danger" | "warning" = "success") {
  const url = new URL(target, "http://localhost");
  url.searchParams.set("toast", message);
  url.searchParams.set("tone", tone);
  return `${url.pathname}${url.search}`;
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function parseJsonItems(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    return JSON.parse(value) as unknown[];
  } catch {
    throw new Error("Quote items could not be parsed.");
  }
}

function parseQuoteInput(formData: FormData) {
  const quoteNumber = String(formData.get("quote_number") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const items = parseJsonItems(formData.get("items_json"));
  const parsed = quoteFormSchema.parse({
    lead_id: leadId || null,
    quote_number: quoteNumber,
    issue_date: formData.get("issue_date"),
    expiry_date: formData.get("expiry_date"),
    status: formData.get("status"),
    currency: formData.get("currency"),
    customer_name: formData.get("customer_name"),
    customer_company: formData.get("customer_company"),
    customer_email: formData.get("customer_email"),
    customer_phone: formData.get("customer_phone"),
    notes: formData.get("notes"),
    payment_terms: formData.get("payment_terms"),
    delivery_terms: formData.get("delivery_terms"),
    discount_type: formData.get("discount_type"),
    discount_value: formData.get("discount_value"),
    shipping_total: formData.get("shipping_total"),
    items,
  }) as QuoteFormInput & { status: Quote["status"] };

  return parsed;
}

function normalizeQuoteItems(items: ReturnType<typeof parseQuoteInput>["items"]) {
  return items.map((item, index) => ({
    product_id: item.product_id ?? "",
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit ?? "unit",
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    discount_type: item.discount_type,
    discount_value: item.discount_value,
    sort_order: item.sort_order ?? index,
  }));
}

export async function createQuoteAction(formData: FormData) {
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/quotes");
  try {
    const parsed = parseQuoteInput(formData);
    await createQuoteRecord({
      ...parsed,
      lead_id: parsed.lead_id ?? null,
      customer_company: parsed.customer_company ?? "",
      customer_email: parsed.customer_email ?? "",
      customer_phone: parsed.customer_phone ?? "",
      notes: parsed.notes ?? "",
      payment_terms: parsed.payment_terms ?? "",
      delivery_terms: parsed.delivery_terms ?? "",
      items: normalizeQuoteItems(parsed.items),
    });
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
    redirect(redirectWithToast(redirectTo, "Quote created successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to create quote."), "danger"));
  }
}

export async function updateQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), `/quotes/${quoteId}`);
  try {
    const parsed = parseQuoteInput(formData);
    await updateQuoteRecord(quoteId, {
      ...parsed,
      lead_id: parsed.lead_id ?? null,
      customer_company: parsed.customer_company ?? "",
      customer_email: parsed.customer_email ?? "",
      customer_phone: parsed.customer_phone ?? "",
      notes: parsed.notes ?? "",
      payment_terms: parsed.payment_terms ?? "",
      delivery_terms: parsed.delivery_terms ?? "",
      items: normalizeQuoteItems(parsed.items),
    });
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
    revalidatePath(`/quotes/${quoteId}`);
    redirect(redirectWithToast(redirectTo, "Quote updated successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to update quote."), "danger"));
  }
}

export async function changeQuoteStatusAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), `/quotes/${quoteId}`);
  try {
    const status = String(formData.get("status") ?? "");
    const allowedStatuses = new Set(QUOTE_STATUSES.map((entry) => entry.value));
    if (!allowedStatuses.has(status as Quote["status"])) {
      throw new Error("Invalid quote status.");
    }

    const statusValue = status as Quote["status"];
    await changeQuoteStatusRecord(quoteId, statusValue);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
    revalidatePath(`/quotes/${quoteId}`);
    redirect(redirectWithToast(redirectTo, "Quote status updated."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to update quote status."), "danger"));
  }
}

export async function deleteQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/quotes");
  try {
    await deleteQuoteRecord(quoteId);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
    revalidatePath(`/quotes/${quoteId}`);
    redirect(redirectWithToast(redirectTo, "Quote deleted successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to delete quote."), "danger"));
  }
}
