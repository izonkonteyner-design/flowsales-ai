import Link from "next/link";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Starter",
    id: "tier-starter",
    href: "/register",
    priceMonthly: "$0",
    description: "Perfect for evaluating FlowSales AI.",
    features: [
      "Up to 10 leads",
      "Up to 5 quotes",
      "Standard support",
    ],
    buttonText: "Try Free",
  },
  {
    name: "Professional",
    id: "tier-professional",
    href: "/register",
    priceMonthly: "$49",
    description: "Ideal for small sales teams needing more capacity.",
    features: [
      "Unlimited leads",
      "Unlimited quotes",
      "AI draft assistance",
      "Priority support",
    ],
    buttonText: "Get Started",
  },
  {
    name: "Team",
    id: "tier-team",
    href: "/register",
    priceMonthly: "$149",
    description: "For growing teams that need collaboration features.",
    features: [
      "Everything in Professional",
      "Up to 10 team members",
      "Team performance reports",
      "Advanced permissions",
    ],
    buttonText: "Coming Soon",
  },
  {
    name: "Enterprise",
    id: "tier-enterprise",
    href: "/register",
    priceMonthly: "Custom",
    description: "Dedicated support and infrastructure for large companies.",
    features: [
      "Everything in Team",
      "Unlimited team members",
      "Custom integrations",
      "Dedicated account manager",
      "SSO & advanced security",
    ],
    buttonText: "Contact Sales",
  },
];

export default function PricingPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-blue-600">Pricing</h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Pricing plans for teams of all sizes
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-slate-600">
          Choose an affordable plan that&#39;s packed with the best features for engaging your leads and closing quotes faster.
        </p>
        <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-4 lg:gap-x-8 lg:gap-y-0">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-3xl p-8 ring-1 ring-slate-200 xl:p-10 ${
                tier.name === "Professional" ? "bg-white shadow-lg ring-2 ring-blue-600" : "bg-white/60"
              }`}
            >
              <h3
                id={tier.id}
                className={`text-lg font-semibold leading-8 ${
                  tier.name === "Professional" ? "text-blue-600" : "text-slate-900"
                }`}
              >
                {tier.name}
              </h3>
              <p className="mt-4 text-sm leading-6 text-slate-600">{tier.description}</p>
              <p className="mt-6 flex items-baseline gap-x-1">
                <span className="text-4xl font-bold tracking-tight text-slate-900">{tier.priceMonthly}</span>
                {tier.priceMonthly !== "Custom" && <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>}
              </p>
              <Link
                href={tier.href}
                className={`mt-6 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  tier.name === "Professional"
                    ? "bg-blue-600 text-white hover:bg-blue-500 focus-visible:outline-blue-600"
                    : "bg-white text-blue-600 ring-1 ring-inset ring-blue-200 hover:ring-blue-300"
                }`}
              >
                {tier.buttonText}
              </Link>
              <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <Check className="h-6 w-5 flex-none text-blue-600" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
