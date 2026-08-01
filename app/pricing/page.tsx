import Link from "next/link";

export const metadata = { title: "Pricing | FlowSales AI", description: "Human-controlled AI sales CRM plans." };

const plans = [
  { key: "starter", name: "Starter", price: "$29", seats: "3 users", ai: "250 AI runs/month", features: ["Core CRM", "Follow-up drafts", "Lead scoring"] },
  { key: "growth", name: "Growth", price: "$79", seats: "10 users", ai: "1,500 AI runs/month", features: ["Next Best Action", "Product recommendations", "Approval Queue", "AI History"] },
  { key: "pro", name: "Pro", price: "$179", seats: "25 users", ai: "5,000 AI runs/month", features: ["Quote recommendations", "Advanced permissions", "Usage and cost controls", "Priority support"] },
];

export default function PricingPage() {
  return <main className="mx-auto max-w-6xl px-4 py-16">
    <div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Transparent plans</p><h1 className="mt-3 text-4xl font-bold tracking-tight">AI sales guidance with human control</h1><p className="mt-4 text-lg text-slate-600">Start with a 14-day workspace trial. Protected actions stay behind approval and usage limits.</p></div>
    <div className="mt-12 grid gap-6 lg:grid-cols-3">{plans.map(plan => <section key={plan.key} className="rounded-3xl border bg-white p-7 shadow-sm"><h2 className="text-2xl font-bold">{plan.name}</h2><p className="mt-3 text-4xl font-bold">{plan.price}<span className="text-base font-normal text-slate-500">/month</span></p><p className="mt-4 text-sm text-slate-600">{plan.seats} · {plan.ai}</p><ul className="mt-6 space-y-3 text-sm">{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul><Link href={`/upgrade?plan=${plan.key}`} className="mt-8 block rounded-xl bg-slate-950 px-4 py-3 text-center font-semibold text-white">Choose {plan.name}</Link></section>)}</div>
    <p className="mt-8 text-center text-sm text-slate-500">Checkout activates only after a production billing provider and plan IDs are configured.</p>
  </main>;
}
