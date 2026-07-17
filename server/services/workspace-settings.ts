import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import type { Organization } from "@/types/crm";
import type { WorkspaceCompanySettings, WorkspaceCompanySettingsInput, WorkspaceSettingsResult } from "@/types/settings";

const WORKSPACE_LOGO_BUCKET = "workspace-assets";
type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

type WorkspaceMutationContext = Awaited<ReturnType<typeof getWorkspaceContext>> & {
  organization: Organization & { logo_path?: string | null };
};

function normalizeText(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMoney(value: unknown, fallback = 0) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function isEditableRole(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export function mapOrganizationToWorkspaceSettings(organization: WorkspaceMutationContext["organization"]): WorkspaceCompanySettings {
  return {
    company_name: organization.name,
    legal_name: normalizeText(organization.legal_name),
    logo_url: normalizeText(organization.logo_url),
    logo_path: normalizeText(organization.logo_path),
    website: normalizeText(organization.website),
    email: normalizeText(organization.email),
    phone: normalizeText(organization.phone),
    secondary_phone: normalizeText(organization.secondary_phone),
    address_line_1: normalizeText(organization.address_line_1),
    address_line_2: normalizeText(organization.address_line_2),
    district: normalizeText(organization.district),
    city: normalizeText(organization.city),
    postal_code: normalizeText(organization.postal_code),
    country: normalizeText(organization.country),
    tax_office: normalizeText(organization.tax_office),
    tax_number: normalizeText(organization.tax_number),
    trade_registry_number: normalizeText(organization.trade_registry_number),
    mersis_number: normalizeText(organization.mersis_number),
    bank_name: normalizeText(organization.bank_name),
    bank_branch: normalizeText(organization.bank_branch),
    iban: normalizeText(organization.iban),
    account_holder: normalizeText(organization.account_holder),
    default_currency: organization.currency as WorkspaceCompanySettings["default_currency"],
    default_tax_rate: normalizeMoney(organization.default_tax_rate, 20),
    default_payment_terms: normalizeText(organization.default_payment_terms),
    default_delivery_terms: normalizeText(organization.default_delivery_terms),
    default_quote_notes: normalizeText(organization.default_quote_notes),
    default_quote_validity_days: Math.max(1, Math.trunc(normalizeMoney(organization.default_quote_validity_days, 30))),
    quote_footer_text: normalizeText(organization.quote_footer_text),
    signature_name: normalizeText(organization.signature_name),
    signature_title: normalizeText(organization.signature_title),
    company_slogan: normalizeText(organization.company_slogan),
  };
}

export function canManageWorkspaceSettings(role: string | null | undefined) {
  return isEditableRole(role);
}

export function getWorkspaceLogoPath(organizationId: string, mimeType: string) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "webp";
  return `organizations/${organizationId}/logo.${extension}`;
}

async function getLiveMutationContext() {
  const context = await getWorkspaceContext();
  if (context.mode !== "live") {
    return null;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  return { context, client };
}

export async function getWorkspaceCompanySettingsData(): Promise<WorkspaceSettingsResult> {
  const context = await getWorkspaceContext();
  return {
    mode: context.mode,
    canEdit: context.mode === "live" && canManageWorkspaceSettings(context.role),
    error: null,
    settings: mapOrganizationToWorkspaceSettings(context.organization as WorkspaceMutationContext["organization"]),
  };
}

async function uploadWorkspaceLogo(
  client: SupabaseServerClient,
  organizationId: string,
  logoFile: File,
  existingPath: string | null,
) {
  const path = getWorkspaceLogoPath(organizationId, logoFile.type);
  const uploadResult = await client.storage.from(WORKSPACE_LOGO_BUCKET).upload(path, logoFile, {
    contentType: logoFile.type,
    upsert: true,
  });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || "Unable to upload workspace logo.");
  }

  if (existingPath && existingPath !== path) {
    await client.storage.from(WORKSPACE_LOGO_BUCKET).remove([existingPath]);
  }

  return {
    logo_path: path,
    logo_url: client.storage.from(WORKSPACE_LOGO_BUCKET).getPublicUrl(path).data.publicUrl,
  };
}

async function removeWorkspaceLogo(client: SupabaseServerClient, logoPath: string | null) {
  if (logoPath) {
    await client.storage.from(WORKSPACE_LOGO_BUCKET).remove([logoPath]);
  }
}

export async function updateWorkspaceCompanySettings(
  input: WorkspaceCompanySettingsInput,
  options: { logoFile?: File | null; removeLogo?: boolean } = {},
) {
  const mutation = await getLiveMutationContext();
  if (!mutation) {
    throw new Error("Workspace settings require a live Supabase session.");
  }

  if (!canManageWorkspaceSettings(mutation.context.role)) {
    throw new Error("You do not have permission to manage workspace settings.");
  }

  const organization = mutation.context.organization as WorkspaceMutationContext["organization"];
  const baseUpdate = {
    name: input.company_name,
    legal_name: input.legal_name,
    website: input.website,
    email: input.email,
    phone: input.phone,
    secondary_phone: input.secondary_phone,
    address_line_1: input.address_line_1,
    address_line_2: input.address_line_2,
    district: input.district,
    city: input.city,
    postal_code: input.postal_code,
    country: input.country,
    tax_office: input.tax_office,
    tax_number: input.tax_number,
    trade_registry_number: input.trade_registry_number,
    mersis_number: input.mersis_number,
    bank_name: input.bank_name,
    bank_branch: input.bank_branch,
    iban: input.iban,
    account_holder: input.account_holder,
    currency: input.default_currency,
    default_tax_rate: input.default_tax_rate,
    default_payment_terms: input.default_payment_terms,
    default_delivery_terms: input.default_delivery_terms,
    default_quote_notes: input.default_quote_notes,
    default_quote_validity_days: input.default_quote_validity_days,
    quote_footer_text: input.quote_footer_text,
    signature_name: input.signature_name,
    signature_title: input.signature_title,
    company_slogan: input.company_slogan,
  };

  let logo_url = normalizeText(organization.logo_url);
  let logo_path = normalizeText(organization.logo_path);

  if (options.removeLogo) {
    await removeWorkspaceLogo(mutation.client, logo_path);
    logo_url = null;
    logo_path = null;
  } else if (options.logoFile && options.logoFile.size > 0) {
    const uploaded = await uploadWorkspaceLogo(mutation.client, organization.id, options.logoFile, logo_path);
    logo_url = uploaded.logo_url;
    logo_path = uploaded.logo_path;
  }

  const { error } = await mutation.client
    .from("organizations")
    .update({
      ...baseUpdate,
      logo_url,
      logo_path,
    })
    .eq("id", organization.id);

  if (error) {
    throw new Error(error.message || "Unable to save workspace settings.");
  }

  return {
    settings: {
      ...input,
      logo_url,
      logo_path,
    } satisfies WorkspaceCompanySettings,
  };
}

export async function removeWorkspaceCompanyLogo() {
  const mutation = await getLiveMutationContext();
  if (!mutation) {
    throw new Error("Workspace settings require a live Supabase session.");
  }

  if (!canManageWorkspaceSettings(mutation.context.role)) {
    throw new Error("You do not have permission to manage workspace settings.");
  }

  const organization = mutation.context.organization as WorkspaceMutationContext["organization"];
  await removeWorkspaceLogo(mutation.client, normalizeText(organization.logo_path));

  const { error } = await mutation.client
    .from("organizations")
    .update({
      logo_url: null,
      logo_path: null,
    })
    .eq("id", organization.id);

  if (error) {
    throw new Error(error.message || "Unable to remove workspace logo.");
  }

  return {
    settings: {
      ...mapOrganizationToWorkspaceSettings({
        ...organization,
        logo_url: null,
        logo_path: null,
      }),
    },
  };
}
