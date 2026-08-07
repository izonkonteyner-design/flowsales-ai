import {
  OmnichannelInboxRepository,
  ConversationSummaryDTO,
  ConversationDetailDTO,
  DEMO_ORGANIZATION_ID,
} from "@/server/repositories/supabase/omnichannel-inbox";
import { loadWorkspaceContext, createDemoWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

export class OmnichannelInboxService {
  private repo = new OmnichannelInboxRepository();

  private async resolveContext() {
    const ctx = await loadWorkspaceContext();
    if (ctx) {
      return {
        organizationId: ctx.organization.id,
        userRole: ctx.role,
        userId: ctx.userId || "demo-user-id",
        isDemo: ctx.mode === "demo" || ctx.organization.id === DEMO_ORGANIZATION_ID,
      };
    }

    const demoCtx = createDemoWorkspaceContext();
    return {
      organizationId: demoCtx.organization.id,
      userRole: demoCtx.role,
      userId: "demo-user-id",
      isDemo: true,
    };
  }

  async getInboxData(params: {
    statusFilter?: string;
    providerFilter?: string;
    assigneeFilter?: string;
    searchQuery?: string;
  }): Promise<{
    conversations: ConversationSummaryDTO[];
    organizationId: string;
    userRole: string;
    userId: string;
    isDemo: boolean;
  }> {
    const ctx = await this.resolveContext();
    const conversations = await this.repo.getConversations({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      statusFilter: params.statusFilter,
      providerFilter: params.providerFilter,
      assigneeFilter: params.assigneeFilter,
      searchQuery: params.searchQuery,
    });
    return { conversations, organizationId: ctx.organizationId, userRole: ctx.userRole, userId: ctx.userId, isDemo: ctx.isDemo };
  }

  async getConversationDetail(conversationId: string): Promise<{
    conversation: ConversationDetailDTO | null;
    userRole: string;
    userId: string;
    isDemo: boolean;
    organizationMembers: Array<{ userId: string; name: string; email: string }>;
  }> {
    const ctx = await this.resolveContext();
    const conversation = await this.repo.getConversationDetail({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      conversationId,
    });

    if (conversation && conversation.unreadCount > 0) {
      await this.repo.markAsRead({ organizationId: ctx.organizationId, userRole: ctx.userRole, conversationId });
    }

    let organizationMembers: Array<{ userId: string; name: string; email: string }> = [];
    if (!ctx.isDemo && ctx.organizationId) {
      const supabase = createSupabaseAdminClient();
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, name, email")
        .eq("organization_id", ctx.organizationId);
      if (members) {
        organizationMembers = members.map((m) => ({ userId: m.user_id, name: m.name || m.email || "Member", email: m.email || "" }));
      }
    }

    return { conversation, userRole: ctx.userRole, userId: ctx.userId, isDemo: ctx.isDemo, organizationMembers };
  }

  async updateStatus(conversationId: string, newStatus: "open" | "pending" | "resolved" | "closed") {
    const ctx = await this.resolveContext();
    const result = await this.repo.updateStatus({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      conversationId,
      newStatus,
    });
    if (result.success) {
      await recordWhatsAppAuditEvent({ organizationId: ctx.organizationId, conversationId, actorUserId: ctx.userId,
        eventType: "conversation_status_changed", metadata: { status: newStatus } });
    }
    return result;
  }

  async updateAssignee(conversationId: string, assignedUserId: string | null) {
    const ctx = await this.resolveContext();
    const result = await this.repo.updateAssignee({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      conversationId,
      assignedUserId,
    });
    if (result.success) {
      await recordWhatsAppAuditEvent({ organizationId: ctx.organizationId, conversationId, actorUserId: ctx.userId,
        eventType: "conversation_assignee_changed", metadata: { assignedUserId } });
    }
    return result;
  }

  async getApprovedTemplates() {
    const ctx = await this.resolveContext();
    const { WhatsAppTemplateService } = await import("@/server/services/integrations/whatsapp-template-service");
    return new WhatsAppTemplateService().getApprovedTemplates(ctx.organizationId);
  }

  async sendTemplateMessage(params: {
    conversationId: string;
    templateName: string;
    languageCode: string;
    bodyParameters?: string[];
    headerParameters?: string[];
  }) {
    const ctx = await this.resolveContext();
    const { WhatsAppTemplateService } = await import("@/server/services/integrations/whatsapp-template-service");
    const service = new WhatsAppTemplateService();
    const clientIdempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random()}`;
    const result = await service.sendTemplateMessage({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      conversationId: params.conversationId,
      templateName: params.templateName,
      languageCode: params.languageCode,
      bodyParameters: params.bodyParameters || [],
      headerParameters: params.headerParameters || [],
      clientIdempotencyKey,
    });
    await recordWhatsAppAuditEvent({
      organizationId: ctx.organizationId,
      conversationId: params.conversationId,
      messageId: result.data?.messageId ?? null,
      actorUserId: ctx.userId,
      eventType: result.success ? "template_sent" : "template_failed",
      metadata: { templateName: params.templateName, languageCode: params.languageCode, errorCode: result.errorCode ?? null },
    });
    return result;
  }
}
