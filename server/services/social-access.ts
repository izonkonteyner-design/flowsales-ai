import "server-only";
import { getWorkspacePlan } from "@/server/services/workspace-plan";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { socialPublishingAllowed, socialConnectionsAllowed } from "@/lib/social-media/access";
import { isDemoWorkspace } from "@/lib/workspace-access";

export async function getSocialAccess() {
  const workspace = await getWorkspaceContext();
  const plan = await getWorkspacePlan(workspace);
  const demo = isDemoWorkspace(workspace);
  const canPublish = process.env.SOCIAL_PUBLISHING_ENABLED === "true" && socialPublishingAllowed(workspace, plan);
  const canConnect = socialConnectionsAllowed(workspace);
  const reason = demo ? "Demo çalışma alanı salt okunurdur. Gönderi oluşturma, yayınlama ve hesap bağlantısı kapalıdır."
    : workspace.role === "viewer" ? "Görüntüleyici rolü salt okunurdur."
    : !plan.configured ? "Çalışma alanının plan bilgileri yüklenemedi. Yönetici faturalandırma ayarlarını kontrol etmelidir."
    : process.env.SOCIAL_PUBLISHING_ENABLED !== "true" ? "Yayın altyapısı henüz yönetici tarafından etkinleştirilmedi."
    : !canPublish ? "Yayınlama için etkin bir deneme, Growth, Pro veya Enterprise planı gerekir." : "";
  return { workspace, plan, demo, canPublish, canConnect, reason };
}
