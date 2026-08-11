import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { testGeminiConnection } from "@/server/services/ai";

function redirectToAI(request: Request, message: string, tone: "success" | "danger", code?: string) {
  const url = new URL("/ai", request.url);
  url.searchParams.set("toast", message);
  url.searchParams.set("tone", tone);
  if (code) url.searchParams.set("aiCode", code);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return redirectToAI(request, "Canlı kullanıcı oturumu gerekli.", "danger");

  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return redirectToAI(request, "Canlı kullanıcı oturumu gerekli.", "danger");

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return redirectToAI(request, "Çalışma alanı üyeliği doğrulanamadı.", "danger");
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return redirectToAI(request, "YZ bağlantı testini yalnızca Owner/Admin çalıştırabilir.", "danger");
  }

  const { data: demoFlag, error: demoError } = await client.rpc("is_demo_organization", {
    p_organization_id: membership.organization_id,
  });
  if (demoError || demoFlag === true) {
    return redirectToAI(request, "Production YZ bağlantı testi demo çalışma alanında kullanılamaz.", "danger");
  }

  const status = await testGeminiConnection();
  return redirectToAI(request, status.message, status.ok ? "success" : "danger", status.code);
}
