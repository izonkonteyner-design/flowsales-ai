"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { completeAuthLink, invalidAuthLinkMessage } from "@/lib/auth/complete-link";

export function AuthLinkCompletion({ next, invalid }: { next: string; invalid: boolean }) {
  const completion = useRef<Promise<string> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!completion.current) {
      const hash = window.location.hash;
      // Remove credentials before loading a client, displaying errors, or navigating.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      completion.current = (async () => {
        const env = getRequiredSupabaseEnv();
        if (invalid || !env.configured) throw new Error(invalidAuthLinkMessage);
        const client = createBrowserClient(env.url, env.anonKey, {
          isSingleton: false,
          auth: { detectSessionInUrl: false },
        });
        return completeAuthLink(hash, next, client.auth);
      })();
    }
    void completion.current.then(
      (target) => { if (active) window.location.replace(target); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [next, invalid]);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">{failed ? "Request a new recovery link" : "Verifying your link"}</h2>
      <p role="status" className="text-sm text-slate-300">
        {failed ? invalidAuthLinkMessage : "Please wait while we securely verify your link."}
      </p>
      {failed ? <a href="/forgot-password" className="inline-flex rounded-xl bg-white px-4 py-3 font-medium text-slate-950">Send a new reset link</a> : null}
    </section>
  );
}
