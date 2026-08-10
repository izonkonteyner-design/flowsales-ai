import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { resolveShowroomTruth, type ShowroomTruth } from "@/server/services/sales-tools/showroom-domain";

export type BusinessLocationInput = {
  id?: string;
  name: string;
  locationType?: "showroom" | "office" | "factory" | "other";
  address: string;
  district?: string | null;
  city: string;
  country?: string;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
  phone?: string | null;
  workingHours?: string | null;
  appointmentRequired?: boolean;
  active?: boolean;
};

function mapLocation(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    workspaceId: String(row.organization_id),
    name: String(row.name),
    city: String(row.city),
    district: row.district ? String(row.district) : null,
    address: String(row.address),
    appointmentRequired: row.appointment_required === true,
    active: row.active === true,
    productIds: [],
    visitingHours: row.working_hours ? String(row.working_hours) : null,
    updatedAt: String(row.updated_at),
    mapsUrl: row.maps_url ? String(row.maps_url) : null,
    phone: row.phone ? String(row.phone) : null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
  };
}

export async function listBusinessLocations(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("business_locations").select("*").eq("organization_id", organizationId).order("active", { ascending: false }).order("name");
  if (error) throw new Error(`İşletme konumları yüklenemedi: ${error.message}`);
  return (data ?? []).map((row) => mapLocation(row as Record<string, unknown>));
}

export async function getTrustedShowroom(organizationId: string, city?: string): Promise<(ShowroomTruth & { mapsUrl: string | null; phone: string | null; latitude: number | null; longitude: number | null }) | null> {
  const locations = await listBusinessLocations(organizationId);
  const target = locations.find((item) => item.active && (!city || item.city.toLocaleLowerCase("tr-TR") === city.toLocaleLowerCase("tr-TR")));
  if (!target) return null;
  const truth = resolveShowroomTruth(target);
  return { ...truth, mapsUrl: target.mapsUrl, phone: target.phone, latitude: target.latitude, longitude: target.longitude };
}

export async function saveBusinessLocation(input: BusinessLocationInput) {
  const ctx = await loadWorkspaceContext();
  if (!ctx || ctx.mode !== "live" || !ctx.userId) throw new Error("Canlı çalışma alanı gerekli.");
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Bu işlem için yönetici yetkisi gerekli.");
  const admin = createSupabaseAdminClient();
  const payload = {
    organization_id: ctx.organization.id,
    name: input.name.trim(),
    location_type: input.locationType ?? "showroom",
    address: input.address.trim(),
    district: input.district?.trim() || null,
    city: input.city.trim(),
    country: input.country?.trim() || "Türkiye",
    postal_code: input.postalCode?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    maps_url: input.mapsUrl?.trim() || null,
    phone: input.phone?.trim() || null,
    working_hours: input.workingHours?.trim() || null,
    appointment_required: input.appointmentRequired === true,
    active: input.active !== false,
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  if (!payload.name || !payload.address || !payload.city) throw new Error("Ad, adres ve şehir zorunludur.");
  const query = input.id
    ? admin.from("business_locations").update(payload).eq("organization_id", ctx.organization.id).eq("id", input.id)
    : admin.from("business_locations").insert(payload);
  const { error } = await query;
  if (error) throw new Error(`Konum kaydedilemedi: ${error.message}`);
  return { success: true };
}

export async function deleteBusinessLocation(id: string) {
  const ctx = await loadWorkspaceContext();
  if (!ctx || ctx.mode !== "live" || !ctx.userId) throw new Error("Canlı çalışma alanı gerekli.");
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("Bu işlem için yönetici yetkisi gerekli.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("business_locations").delete().eq("organization_id", ctx.organization.id).eq("id", id);
  if (error) throw new Error(`Konum silinemedi: ${error.message}`);
  return { success: true };
}
