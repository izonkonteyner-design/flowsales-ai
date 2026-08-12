"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onboardingSchema, type OnboardingActionState } from "@/lib/validations/onboarding";
import { getWorkspaceContext } from "@/server/services/workspace-context";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function completeOnboardingAction(_: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.role !== "owner") {
    redirect("/dashboard");
  }

  const parsed = onboardingSchema.safeParse({
    company_name: formData.get("company_name"), industry: formData.get("industry"), currency: formData.get("currency"),
    phone: formData.get("phone"), city: formData.get("city"), country: formData.get("country"), timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return { success: false, message: "Lütfen işaretli alanları kontrol edin.", fieldErrors: Object.fromEntries(Object.entries(errors).map(([key, values]) => [key, values?.[0]])) };
  }

  // Handle optional logo upload
  const logoFile = formData.get("logo") as File | null;
  let logo_path = workspace.organization.logo_path;
  let logo_url = workspace.organization.logo_url;

  if (logoFile && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_SIZE) return { success: false, message: "Logo yüklenemedi.", fieldErrors: { logo: "Logo en fazla 2 MB olabilir." } };
    if (!ALLOWED_LOGO_TYPES.has(logoFile.type)) return { success: false, message: "Logo yüklenemedi.", fieldErrors: { logo: "PNG, JPEG veya WebP dosyası seçin." } };
    const extension = logoFile.type === "image/png" ? "png" : logoFile.type === "image/jpeg" ? "jpg" : "webp";
    const path = `organizations/${workspace.organization.id}/logo.${extension}`;
    
    const { error: uploadError } = await client.storage
      .from("workspace-assets")
      .upload(path, logoFile, { contentType: logoFile.type, upsert: true });
      
    if (uploadError) return { success: false, message: "Logo şu anda yüklenemedi. Tekrar deneyin.", fieldErrors: { logo: "Dosya yükleme başarısız." } };
    logo_path = path;
    logo_url = client.storage.from("workspace-assets").getPublicUrl(path).data.publicUrl;
  }

  // Finalize onboarding by setting onboarding_completed_at
  const { error } = await client
    .from("organizations")
    .update({
      name: parsed.data.company_name, industry: parsed.data.industry || null, currency: parsed.data.currency,
      phone: parsed.data.phone || null, city: parsed.data.city || null, country: parsed.data.country, timezone: parsed.data.timezone,
      logo_path,
      logo_url,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", workspace.organization.id);

  if (error) {
    return { success: false, message: "Kurulum kaydedilemedi. Lütfen tekrar deneyin.", fieldErrors: {} };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  redirect(`/dashboard?toast=${encodeURIComponent("Çalışma alanınız hazır")}&tone=success`);
}
