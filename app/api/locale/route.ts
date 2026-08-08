import { NextRequest, NextResponse } from "next/server";

import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = normalizeLocale(body.locale);

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const client = await createSupabaseServerClient();
  if (client) {
    const { data } = await client.auth.getUser();
    if (data.user) {
      await client.from("profiles").upsert({ id: data.user.id, language: locale }, { onConflict: "id" });
    }
  }

  return response;
}
