"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

type Props = {
  agentType: string;
  label: string;
};

export function NewConversationSelector({ agentType, label }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleStart = () => {
    if (pending) return;
    setPending(true);
    router.push(`/ai-workforce/conversations/new?type=${encodeURIComponent(agentType)}`);
  };

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={pending}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}
