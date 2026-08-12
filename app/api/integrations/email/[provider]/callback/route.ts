import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { completeEmailOAuth, type EmailProvider } from "@/server/services/integrations/email-service";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const workspace = await getWorkspaceContext();
  const { provider: rawProvider } = await context.params;
  if (workspace.mode !== "live" || !workspace.userId) redirect("/login");
  if (rawProvider !== "gmail" && rawProvider !== "microsoft") return Response.json({ message: "Geçersiz sağlayıcı." }, { status: 400 });
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state"); const denied = url.searchParams.get("error");
  if (denied || !code || !state) redirect(`/settings/integrations/email?error=${encodeURIComponent("E-posta erişimi onaylanmadı.")}`);
  let callbackError: string | null = null;
  try {
    await completeEmailOAuth({ provider: rawProvider as EmailProvider, code, state, organizationId: workspace.organization.id, userId: workspace.userId });
  } catch (error) {
    callbackError = error instanceof Error ? error.message : "Bağlantı tamamlanamadı.";
  }
  if (callbackError) redirect(`/settings/integrations/email?error=${encodeURIComponent(callbackError)}`);
  redirect("/settings/integrations/email?connected=1");
}
