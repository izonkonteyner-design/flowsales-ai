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
  return <main className="mx-auto max-w-5xl px-4 py-16"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Trust center</p><h1 className="mt-3 text-4xl font-bold">Security and responsible AI</h1><p className="mt-4 text-lg leading-8 text-slate-600">FlowSales AI is designed as decision support. Protected actions require human review, and customer data remains scoped to its workspace.</p></div><div className="mt-10 grid gap-5 md:grid-cols-2">{controls.map(([title,body]) => <section key={title} className="rounded-2xl border bg-white p-6"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></section>)}</div><section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="font-semibold text-amber-950">Operational boundary</h2><p className="mt-2 text-sm text-amber-900">Security claims require production migration deployment, environment configuration, backup verification and incident-response ownership before commercial launch.</p></section><div className="mt-8 flex gap-4 text-sm font-semibold"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/pricing">Pricing</Link></div></main>;
}
