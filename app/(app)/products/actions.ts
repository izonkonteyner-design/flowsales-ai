"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function splitSpecifications(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseProductInput(formData: FormData) {
  const parsed = productFormSchema.parse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    unit_price: formData.get("unit_price"),
    currency: formData.get("currency"),
    tax_rate: formData.get("tax_rate"),
    unit: formData.get("unit"),
    active: formData.get("active"),
    specifications: splitSpecifications(formData.get("specifications")),
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
