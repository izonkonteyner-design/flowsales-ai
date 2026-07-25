import { redirect } from "next/navigation";
import { startNewConversation } from "../../actions";

export default async function NewConversationRoute() {
  try {
    const { conversationId } = await startNewConversation();
    redirect(`/ai-workforce/conversations/${conversationId}`);
  } catch (error) {
    console.error("Failed to start new conversation", error);
    redirect("/ai-workforce/conversations?error=failed_to_start");
  }
}
