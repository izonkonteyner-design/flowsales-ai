"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  workspaceLogoMetadataSchema,
  workspaceSettingsInputSchema,
  type WorkspaceSettingsInput,
} from "@/lib/validations/workspace-settings";
import {
  removeWorkspaceCompanyLogo,
  updateWorkspaceCompanySettings,
} from "@/server/services/workspace-settings";

function readToastMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function readWorkspaceSettingsInput(formData: FormData): { input: WorkspaceSettingsInput; logoFile: File | null } {
  const fileValue = formData.get("logo_file");
  const logoFile = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

  if (logoFile) {
    workspaceLogoMetadataSchema.parse({
      name: logoFile.name,
      type: logoFile.type,
      size: logoFile.size,
    });
  }

  const payload = {
    company_name: String(formData.get("company_name") ?? "").trim(),
    legal_name: String(formData.get("legal_name") ?? ""),
    website: String(formData.get("website") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    secondary_phone: String(formData.get("secondary_phone") ?? ""),
    address_line_1: String(formData.get("address_line_1") ?? ""),
    address_line_2: String(formData.get("address_line_2") ?? ""),
    district: String(formData.get("district") ?? ""),
    city: String(formData.get("city") ?? ""),
    postal_code: String(formData.get("postal_code") ?? ""),
    country: String(formData.get("country") ?? ""),
    tax_office: String(formData.get("tax_office") ?? ""),
    tax_number: String(formData.get("tax_number") ?? ""),
    trade_registry_number: String(formData.get("trade_registry_number") ?? ""),
    mersis_number: String(formData.get("mersis_number") ?? ""),
    bank_name: String(formData.get("bank_name") ?? ""),
    bank_branch: String(formData.get("bank_branch") ?? ""),
    iban: String(formData.get("iban") ?? ""),
    account_holder: String(formData.get("account_holder") ?? ""),
    default_currency: String(formData.get("default_currency") ?? ""),
    default_tax_rate: String(formData.get("default_tax_rate") ?? "20"),
    default_payment_terms: String(formData.get("default_payment_terms") ?? ""),
    default_delivery_terms: String(formData.get("default_delivery_terms") ?? ""),
    default_quote_notes: String(formData.get("default_quote_notes") ?? ""),
    default_quote_validity_days: String(formData.get("default_quote_validity_days") ?? "30"),
    quote_footer_text: String(formData.get("quote_footer_text") ?? ""),
    signature_name: String(formData.get("signature_name") ?? ""),
    signature_title: String(formData.get("signature_title") ?? ""),
    company_slogan: String(formData.get("company_slogan") ?? ""),
  };

  return {
    input: workspaceSettingsInputSchema.parse(payload),
    logoFile,
  };
}

export async function updateWorkspaceSettingsAction(formData: FormData) {
  try {
    const { input, logoFile } = readWorkspaceSettingsInput(formData);
    await updateWorkspaceCompanySettings(input, { logoFile });
    revalidatePath("/settings");
    revalidatePath("/quotes");
    revalidatePath("/quotes/new");
  } catch (error) {
    redirect(`/settings?toast=${encodeURIComponent(readToastMessage(error, "Unable to save workspace settings."))}&tone=danger`);
  }

  redirect("/settings?toast=Workspace%20settings%20saved&tone=success");
}

export async function removeWorkspaceLogoAction() {
  try {
    await removeWorkspaceCompanyLogo();
    revalidatePath("/settings");
    revalidatePath("/quotes");
    revalidatePath("/quotes/new");
  } catch (error) {
    redirect(`/settings?toast=${encodeURIComponent(readToastMessage(error, "Unable to remove workspace logo."))}&tone=danger`);
  }

  redirect("/settings?toast=Workspace%20logo%20removed&tone=success");
}
