import Link from "next/link";
import { ArrowRight, Bot, Sparkles, Users } from "lucide-react";

const highlights = [
  {
    icon: Users,
    title: "Lead management",
    description: "Capture, qualify, and move opportunities through a clear pipeline.",
  },
  {
    icon: Bot,
    title: "AI sales support",
    description: "Draft follow-ups, summaries, and quote notes with workspace context.",
  },
  {
    icon: Sparkles,
    title: "Premium workspace",
    description: "A polished CRM shell built for speed, clarity, and scale.",
  },
];

export default function HomePage() {
  return (
    <main className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_26%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]" />

      <section className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-12">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4 text-blue-600" />
            FlowSales AI
          </div>

          <h1 className="mt-8 text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Your AI sales employee for SMEs.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Manage leads, quotes, follow-ups, tasks, and team workflows from one
            premium workspace built for modern sales operations.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-6 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Open dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <Link
              href="/leads"
              className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-6 text-sm font-medium text-slate-900 shadow-sm backdrop-blur transition hover:bg-white"
            >
              View leads
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-5 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.title}
                className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>

                <h2 className="mt-6 text-xl font-semibold text-slate-950">
                  {item.title}
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
