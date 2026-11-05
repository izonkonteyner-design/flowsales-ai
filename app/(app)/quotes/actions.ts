"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isQuoteStatus, quoteFormSchema, type QuoteFormInput } from "@/lib/validations/quote";
import {
  createQuoteRecord,
  deleteQuoteRecord,
  duplicateQuoteRecord,
  updateQuoteRecord,
  updateQuoteStatusRecord,
} from "@/server/services/quotes";

function readRedirectTo(formData: FormData) {
  const value = formData.get("redirect_to");
  return typeof value === "string" && value.startsWith("/") ? value : "/quotes";
}

function readQuoteFormInput(formData: FormData): QuoteFormInput {
  const itemsRaw = formData.get("items_json");
  if (typeof itemsRaw !== "string" || !itemsRaw.trim()) {
    throw new Error("Quote lines are required.");
  }

  const leadValue = formData.get("lead_id");
  const customerValue = formData.get("customer_id");

  const payload = {
    lead_id: typeof leadValue === "string" && leadValue.trim() ? leadValue.trim() : null,
    customer_id: typeof customerValue === "string" && customerValue.trim() ? customerValue.trim() : null,
    quote_number: String(formData.get("quote_number") ?? "").trim(),
    issue_date: String(formData.get("issue_date") ?? "").trim(),
    valid_until: String(formData.get("valid_until") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
    currency: String(formData.get("currency") ?? "").trim(),
    shipping_total: String(formData.get("shipping_total") ?? "0"),
    order_discount_type: String(formData.get("order_discount_type") ?? "percentage"),
    order_discount_value: String(formData.get("order_discount_value") ?? "0"),
    notes: String(formData.get("notes") ?? ""),
    payment_terms: String(formData.get("payment_terms") ?? ""),
    delivery_terms: String(formData.get("delivery_terms") ?? ""),
    items: JSON.parse(itemsRaw) as QuoteFormInput["items"],
  };

  return quoteFormSchema.parse(payload);
}

export async function createQuoteAction(formData: FormData) {
  const redirectTo = readRedirectTo(formData);
  let result;
  try {
    const input = readQuoteFormInput(formData);
    result = await createQuoteRecord(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teklif oluşturulamadı.";
    redirect(`/quotes/new?toast=${encodeURIComponent(message)}&tone=danger&redirect_to=${encodeURIComponent(redirectTo)}`);
  }

  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  redirect(`/quotes/${result.quote.id}?toast=${encodeURIComponent("Teklif oluşturuldu")}&tone=success&redirect_to=${encodeURIComponent(redirectTo)}`);
}

export async function updateQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "").trim();
  if (!quoteId) {
    throw new Error("Quote id is required.");
  }

  const redirectTo = readRedirectTo(formData);
  let result;
  try {
    const input = readQuoteFormInput(formData);
    result = await updateQuoteRecord(quoteId, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teklif güncellenemedi.";
    redirect(`/quotes/${quoteId}?toast=${encodeURIComponent(message)}&tone=danger&redirect_to=${encodeURIComponent(redirectTo)}`);
  }

  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${result.quote.id}?toast=${encodeURIComponent("Teklif güncellendi")}&tone=success&redirect_to=${encodeURIComponent(redirectTo)}`);
}

export async function updateQuoteStatusAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!quoteId) {
    throw new Error("Quote id is required.");
  }

  if (!isQuoteStatus(status)) {
    throw new Error("Invalid quote status.");
  }

  try {
    await updateQuoteStatusRecord(quoteId, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teklif durumu güncellenemedi.";
    redirect(`/quotes/${quoteId}?toast=${encodeURIComponent(message)}&tone=danger`);
  }

  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}?toast=${encodeURIComponent("Teklif durumu güncellendi")}&tone=success`);
}

export async function duplicateQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "").trim();
  if (!quoteId) {
    throw new Error("Quote id is required.");
  }

  let result;
  try {
    result = await duplicateQuoteRecord(quoteId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teklif çoğaltılamadı.";
    redirect(`/quotes/${quoteId}?toast=${encodeURIComponent(message)}&tone=danger`);
  }

  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  redirect(`/quotes/${result.quote.id}?toast=${encodeURIComponent("Teklif çoğaltıldı")}&tone=success`);
}

export async function deleteQuoteAction(formData: FormData) {
  const quoteId = String(formData.get("quote_id") ?? "").trim();
  if (!quoteId) {
    throw new Error("Quote id is required.");
  }

  const redirectTo = readRedirectTo(formData);
  try {
    await deleteQuoteRecord(quoteId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teklif silinemedi.";
    redirect(`/quotes/${quoteId}?toast=${encodeURIComponent(message)}&tone=danger`);
  }

  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  redirect(`${redirectTo}?toast=${encodeURIComponent("Teklif silindi")}&tone=success`);
}
