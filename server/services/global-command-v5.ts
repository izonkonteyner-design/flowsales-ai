import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export async function searchSalesEntities(organizationId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const admin = createSupabaseAdminClient();
  const [leads, contacts, quotes, calls] = await Promise.all([
    admin.from("leads").select("id,full_name,phone,status").eq("organization_id", organizationId).or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8),
    admin.from("contacts").select("id,full_name,phone").eq("organization_id", organizationId).or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8),
    admin.from("quotes").select("id,quote_number,status,total,grand_total").eq("organization_id", organizationId).ilike("quote_number", `%${q}%`).limit(8),
    admin.from("voice_calls").select("id,from_number,to_number,state,started_at").eq("organization_id", organizationId).or(`from_number.ilike.%${q}%,to_number.ilike.%${q}%`).limit(8),
  ]);
  return [
    ...(leads.data || []).map((row) => ({ type: "lead", id: row.id, label: row.full_name, meta: `${row.phone || ""} · ${row.status}`, href: `/leads/${row.id}` })),
    ...(contacts.data || []).map((row) => ({ type: "customer", id: row.id, label: row.full_name, meta: row.phone || "", href: `/customers/${row.id}` })),
    ...(quotes.data || []).map((row) => ({ type: "quote", id: row.id, label: row.quote_number, meta: `${row.status} · ${Number(row.grand_total ?? row.total ?? 0).toLocaleString("tr-TR")} TL`, href: `/quotes/${row.id}` })),
    ...(calls.data || []).map((row) => ({ type: "call", id: row.id, label: `${row.from_number} → ${row.to_number}`, meta: `${row.state} · ${new Date(row.started_at).toLocaleString("tr-TR")}`, href: `/voice/calls/${row.id}` })),
  ];
}
