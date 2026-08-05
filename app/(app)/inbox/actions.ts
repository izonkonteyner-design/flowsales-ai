"use server";

import { OmnichannelInboxService } from "@/server/services/omnichannel-inbox";
import { revalidatePath } from "next/cache";

export async function fetchInboxDataAction(params: {
  statusFilter?: string;
  providerFilter?: string;
  assigneeFilter?: string;
  searchQuery?: string;
}) {
  const service = new OmnichannelInboxService();
  return service.getInboxData(params);
}

export async function fetchConversationDetailAction(conversationId: string) {
  const service = new OmnichannelInboxService();
  return service.getConversationDetail(conversationId);
}

export async function updateConversationStatusAction(
  conversationId: string,
  newStatus: "open" | "pending" | "resolved" | "closed"
) {
  const service = new OmnichannelInboxService();
  const res = await service.updateStatus(conversationId, newStatus);
  if (res.success) {
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${conversationId}`);
  }
  return res;
}

export async function updateConversationAssigneeAction(
  conversationId: string,
  assignedUserId: string | null
) {
  const service = new OmnichannelInboxService();
  const res = await service.updateAssignee(conversationId, assignedUserId);
  if (res.success) {
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${conversationId}`);
  }
  return res;
}
