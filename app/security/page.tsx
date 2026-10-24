import Link from "next/link";

export const metadata = { title: "Security | FlowSales AI", description: "FlowSales AI security, data isolation and responsible AI controls." };

const controls = [
  ["Workspace isolation", "Supabase Row Level Security and workspace-scoped repositories prevent cross-tenant reads."],
  ["Human approval", "AI recommendations cannot directly send messages, create quotes or update CRM records."],
  ["Demo Safe Mode", "The shared demo workspace is read-only at UI, service and database layers."],
  ["Structured AI output", "Provider responses are parsed with strict schemas and fail closed when invalid."],
  ["Secret protection", "Service-role and billing secrets remain server-only and are never returned to browsers."],
  ["Auditability", "AI runs, approval decisions, provider metadata, usage and failures are persisted for review."],
];

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Trust center</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Security and responsible AI</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-400">
          FlowSales AI is designed as decision support. Protected actions require human review, and customer data remains scoped to its workspace.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {controls.map(([title, body]) => (
          <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{body}</p>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/40">
        <h2 className="font-semibold text-amber-950 dark:text-amber-200">Operational boundary</h2>
        <p className="mt-2 text-sm text-amber-900 dark:text-amber-300">
          Security claims require production migration deployment, environment configuration, backup verification and incident-response ownership before commercial launch.
        </p>
      </section>

      <div className="mt-8 flex gap-4 text-sm font-semibold text-violet-600 dark:text-violet-400">
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/pricing" className="hover:underline">Pricing</Link>
      </div>
    </main>
  );
}
