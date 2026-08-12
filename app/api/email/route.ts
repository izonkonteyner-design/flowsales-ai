import { getWorkspaceContext } from "@/server/services/workspace-context";
import { disconnectEmailConnection, sendEmail, syncEmailConnection } from "@/server/services/integrations/email-service";

export async function POST(request: Request) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || !workspace.userId) return Response.json({ message: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json();
    if (body.action === "sync") {
      const processed = await syncEmailConnection(workspace.organization.id, String(body.connectionId || ""));
      return Response.json({ ok: true, message: `${processed} e-posta eşitlendi.` });
    }
    if (body.action === "send") {
      await sendEmail({ organizationId: workspace.organization.id, connectionId: String(body.connectionId || ""), to: String(body.to || ""), subject: String(body.subject || ""), body: String(body.body || "") });
      return Response.json({ ok: true, message: "E-posta gönderildi." });
    }
    if (body.action === "disconnect") {
      if (!(["owner", "admin"] as string[]).includes(workspace.role)) return Response.json({ message: "Yönetici yetkisi gerekiyor." }, { status: 403 });
      await disconnectEmailConnection(workspace.organization.id, String(body.connectionId || ""));
      return Response.json({ ok: true, message: "E-posta hesabı bağlantısı kaldırıldı." });
    }
    return Response.json({ message: "Geçersiz işlem." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "E-posta işlemi tamamlanamadı." }, { status: 500 });
  }
}
