import Link from "next/link";
import { redirect } from "next/navigation";
import { startNewConversation } from "../../actions";
import { AGENT_REGISTRY } from "@/server/ai-agents/agents/registry";
import type { AgentType } from "@/server/ai-agents/schema";
import { NewConversationSelector } from "./selector-client";

export const dynamic = "force-dynamic";

const AGENT_ACCENTS: Record<AgentType, string> = {
  sales: "from-blue-500/10 to-indigo-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/20",
  support: "from-emerald-500/10 to-teal-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  operations: "from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  reporting: "from-violet-500/10 to-purple-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20",
  social: "from-pink-500/10 to-rose-500/10 text-pink-700 dark:text-pink-300 ring-pink-500/20",
};

const PLACEHOLDER: Record<AgentType, string> = {
  sales: "I want to get a quote for 10 Enterprise licenses.",
  support: "My refund has not arrived yet — can you help?",
  operations: "Where is order #1042?",
  reporting: "Send me the daily sales digest.",
  social: "Draft 3 LinkedIn posts about AI in sales.",
};

const PLACEHOLDER_STYLES: Record<AgentType, string> = {
  sales: "Test Chat (Sales)",
  support: "Test Chat (Support)",
  operations: "Test Chat (Operations)",
  reporting: "New Report Chat",
  social: "New Social Chat",
};

export default async function NewConversationRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedType = typeof params.type === "string" ? params.type : undefined;

  if (requestedType) {
    try {
      const { conversationId } = await startNewConversation(requestedType);
      redirect(`/ai-workforce/conversations/${conversationId}`);
    } catch (error) {
      console.error("Failed to start new conversation", error);
      redirect("/ai-workforce/conversations?error=failed_to_start");
    }
  }

  const choices = Object.values(AGENT_REGISTRY);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Start a new conversation</h2>
            <p className="text-sm text-slate-500">
              Choose an AI agent to talk to. Each agent owns its own playbooks and actions.
            </p>
          </div>
          <Link
            href="/ai-workforce/conversations"
            className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Back to conversations
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {choices.map((choice) => {
          const accent = AGENT_ACCENTS[choice.type];
          return (
            <div
              key={choice.type}
              className="rounded-2xl border border-slate-200 bg-white p-5 ring-1 ring-inset ring-transparent transition hover:shadow-lg dark:border-white/10 dark:bg-slate-950"
            >
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full bg-gradient-to-br px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${accent}`}
                  >
                    {choice.type}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold">{choice.displayName}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {choice.description}
                  </p>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Try: <span className="italic">{PLACEHOLDER[choice.type]}</span>
                </p>
                <div className="mt-auto pt-2">
                  <NewConversationSelector agentType={choice.type} label={PLACEHOLDER_STYLES[choice.type]} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
