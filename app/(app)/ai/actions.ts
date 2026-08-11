"use server";

import { redirect } from "next/navigation";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { testGeminiConnection } from "@/server/services/ai";

export async function testAIConnectionAction() {
  const ctx = await loadWorkspaceContext();
  if (!ctx || ctx.mode !== "live" || !ctx.userId) {
    redirect("/ai?toast=Canlı%20kullanıcı%20oturumu%20gerekli&tone=danger");
  }
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    redirect("/ai?toast=YZ%20bağlantı%20testini%20yalnızca%20Owner/Admin%20çalıştırabilir&tone=danger");
  }

  const status = await testGeminiConnection();
  const tone = status.ok ? "success" : "danger";
  redirect(`/ai?toast=${encodeURIComponent(status.message)}&tone=${tone}&aiCode=${status.code}`);
}
