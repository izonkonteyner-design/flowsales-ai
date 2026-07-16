"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { productFormSchema } from "@/lib/validations/product";
import {
  createProductRecord,
  deleteProductRecord,
  updateProductRecord,
} from "@/server/services/products";

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
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function parseJsonArray<T>(value: FormDataEntryValue | null, fallback: T[] = []) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "true";
}

function parseProductInput(formData: FormData) {
  const parsed = productFormSchema.parse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    short_description: formData.get("short_description"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    unit_price: formData.get("unit_price"),
    currency: formData.get("currency"),
    tax_rate: formData.get("tax_rate"),
    unit: formData.get("unit"),
    width: formData.get("width"),
    length: formData.get("length"),
    height: formData.get("height"),
    area_m2: formData.get("area_m2"),
    weight_kg: formData.get("weight_kg"),
    material: formData.get("material"),
    color: formData.get("color"),
    stock_quantity: formData.get("stock_quantity"),
    minimum_order_quantity: formData.get("minimum_order_quantity"),
    lead_time_days: formData.get("lead_time_days"),
    warranty_months: formData.get("warranty_months"),
    internal_code: formData.get("internal_code"),
    barcode: formData.get("barcode"),
    tags: parseTags(formData.get("tags")),
    features: parseJsonArray<string>(formData.get("features_json")),
    specifications: parseJsonArray<{ key: string; value: string }>(formData.get("specifications_json")),
    image_url: formData.get("image_url"),
    gallery_urls: parseJsonArray<string>(formData.get("gallery_urls_json")),
    featured: parseBoolean(formData.get("featured")),
    active: parseBoolean(formData.get("active")),
    notes: formData.get("notes"),
  });

  return parsed;
}

export async function createProductAction(formData: FormData) {
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/products");
  try {
    await createProductRecord(parseProductInput(formData));
    revalidatePath("/products");
    revalidatePath("/dashboard");
    redirect(redirectWithToast(redirectTo, "Product created successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to create product."), "danger"));
  }
}

export async function updateProductAction(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), `/products/${productId}`);
  try {
    await updateProductRecord(productId, parseProductInput(formData));
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath(`/products/${productId}`);
    redirect(redirectWithToast(redirectTo, "Product updated successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to update product."), "danger"));
  }
}

export async function deleteProductAction(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/products");
  try {
    await deleteProductRecord(productId);
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath(`/products/${productId}`);
    redirect(redirectWithToast(redirectTo, "Product deleted successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to delete product."), "danger"));
  }
}
