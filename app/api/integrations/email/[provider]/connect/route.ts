import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createEmailAuthorizationUrl, type EmailProvider } from "@/server/services/integrations/email-service";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const workspace = await getWorkspaceContext();
  const { provider: rawProvider } = await context.params;
  if (workspace.mode !== "live" || !workspace.userId) return Response.json({ message: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!(["owner", "admin"] as string[]).includes(workspace.role)) return Response.json({ message: "Bu işlem için yönetici yetkisi gerekiyor." }, { status: 403 });
  if (rawProvider !== "gmail" && rawProvider !== "microsoft") return Response.json({ message: "Geçersiz e-posta sağlayıcısı." }, { status: 400 });
  let authorizationUrl: string;
  try {
    authorizationUrl = await createEmailAuthorizationUrl({ provider: rawProvider as EmailProvider, organizationId: workspace.organization.id, userId: workspace.userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "E-posta bağlantısı başlatılamadı.";
    redirect(`/settings/integrations/email?error=${encodeURIComponent(message)}`);
  }
  redirect(authorizationUrl);
}
