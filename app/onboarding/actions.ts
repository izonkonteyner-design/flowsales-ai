"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";

export async function completeOnboardingAction(formData: FormData) {
  const client = await createSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.role !== "owner") {
    redirect("/dashboard");
  }

  const companyName = formData.get("company_name")?.toString().trim();
  const industry = formData.get("industry")?.toString().trim();
  const currency = formData.get("currency")?.toString().trim() || "TRY";
  
  if (!companyName) {
    throw new Error("Company name is required");
  }

  // Handle optional logo upload
  const logoFile = formData.get("logo") as File | null;
  let logo_path = workspace.organization.logo_path;
  let logo_url = workspace.organization.logo_url;

  if (logoFile && logoFile.size > 0) {
    const extension = logoFile.type === "image/png" ? "png" : logoFile.type === "image/jpeg" ? "jpg" : "webp";
    const path = `organizations/${workspace.organization.id}/logo.${extension}`;
    
    const { error: uploadError } = await client.storage
      .from("workspace-assets")
      .upload(path, logoFile, { contentType: logoFile.type, upsert: true });
      
    if (!uploadError) {
      logo_path = path;
      logo_url = client.storage.from("workspace-assets").getPublicUrl(path).data.publicUrl;
    }
  }

  // Handle optional first product
  const productName = formData.get("product_name")?.toString().trim();
  const productPrice = parseFloat(formData.get("product_price")?.toString() || "0");
  if (productName) {
    await client.from("products").insert({
      organization_id: workspace.organization.id,
      name: productName,
      category: "General",
      description: "First product",
      base_price: productPrice,
      currency: currency,
      tax_rate: 20,
      unit: "pcs",
      active: true,
      tags: [],
      features: [],
      specifications: [],
      gallery_urls: [],
    });
  }

  // Handle optional first lead
  const leadName = formData.get("lead_name")?.toString().trim();
  const leadCompany = formData.get("lead_company")?.toString().trim();
  const leadEmail = formData.get("lead_email")?.toString().trim();
  if (leadName) {
    await client.from("leads").insert({
      organization_id: workspace.organization.id,
      full_name: leadName,
      company: leadCompany || "Unknown",
      email: leadEmail || "",
      phone: "",
      city: "",
      source: "Manual",
      status: "new",
      estimated_value: 0,
      currency: currency,
      notes: "First lead from onboarding",
      assigned_to: workspace.userId,
      created_by: workspace.userId,
    });
  }

  // Finalize onboarding by setting onboarding_completed_at
  const { error } = await client
    .from("organizations")
    .update({
      name: companyName,
      industry: industry || null,
      currency: currency,
      logo_path,
      logo_url,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", workspace.organization.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/dashboard?toast=Welcome%20to%20your%20workspace&tone=success");
}
