"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveBusinessLocation, deleteBusinessLocation } from "@/server/services/business-locations";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveBusinessLocationAction(formData: FormData) {
  try {
    const latRaw = text(formData, "latitude");
    const lngRaw = text(formData, "longitude");
    await saveBusinessLocation({
      id: text(formData, "id") || undefined,
      name: text(formData, "name"),
      locationType: (text(formData, "locationType") || "showroom") as "showroom" | "office" | "factory" | "other",
      address: text(formData, "address"),
      district: text(formData, "district") || null,
      city: text(formData, "city"),
      mapsUrl: text(formData, "mapsUrl") || null,
      phone: text(formData, "phone") || null,
      workingHours: text(formData, "workingHours") || null,
      latitude: latRaw ? Number(latRaw) : null,
      longitude: lngRaw ? Number(lngRaw) : null,
      appointmentRequired: formData.get("appointmentRequired") === "on",
      active: formData.get("active") === "on",
    });
  } catch (error) {
    redirect(`/settings/business-locations?toast=${encodeURIComponent(error instanceof Error ? error.message : "Konum kaydedilemedi")}&tone=danger`);
  }
  revalidatePath("/settings/business-locations");
  redirect("/settings/business-locations?toast=Konum%20kaydedildi&tone=success");
}

export async function deleteBusinessLocationAction(formData: FormData) {
  try { await deleteBusinessLocation(text(formData, "id")); }
  catch (error) { redirect(`/settings/business-locations?toast=${encodeURIComponent(error instanceof Error ? error.message : "Konum silinemedi")}&tone=danger`); }
  revalidatePath("/settings/business-locations");
  redirect("/settings/business-locations?toast=Konum%20silindi&tone=success");
}
