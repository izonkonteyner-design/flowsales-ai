import Link from "next/link";
import { Check } from "lucide-react";

const tiers = [
  {
    key: "starter",
    name: "Starter",
    priceMonthly: "$29",
    seats: "3 users",
    ai: "250 AI runs/month",
    features: ["Core CRM", "Follow-up drafts", "Lead scoring"],
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthly: "$79",
    seats: "10 users",
    ai: "1,500 AI runs/month",
    features: ["Next Best Action", "Product recommendations", "Approval Queue", "AI History"],
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: "$179",
    seats: "25 users",
    ai: "5,000 AI runs/month",
    features: ["Quote recommendations", "Advanced permissions", "Usage and cost controls", "Priority support"],
  },
];

export default function PricingPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-base font-semibold leading-7 text-blue-600">Transparent plans</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            AI sales guidance with human control
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Start with a 14-day workspace trial. Protected actions stay behind approval and usage limits.
          </p>
        </div>

        <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8 lg:gap-y-0">
          {tiers.map((tier) => (
            <section key={tier.key} className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 xl:p-10">
              <h2 className="text-xl font-semibold text-slate-900">{tier.name}</h2>
              <p className="mt-6 flex items-baseline gap-x-1">
                <span className="text-4xl font-bold tracking-tight text-slate-900">{tier.priceMonthly}</span>
                <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
              </p>
              <p className="mt-4 text-sm text-slate-600">{tier.seats} · {tier.ai}</p>
              <Link href={`/upgrade?plan=${tier.key}`} className="mt-6 block rounded-md bg-slate-950 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-slate-800">
                Choose {tier.name}
              </Link>
              <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <Check className="h-6 w-5 flex-none text-blue-600" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Checkout activates only after a production billing provider and plan IDs are configured.
        </p>
      </div>
    </div>
  );
}
