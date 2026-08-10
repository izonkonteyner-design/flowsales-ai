import Link from "next/link";
import { ArrowRight, Bot, Sparkles, Users } from "lucide-react";
import { startDemoAction } from "@/app/(auth)/actions";

const highlights = [
  {
    icon: Users,
    title: "Lead yönetimi",
    description: "Potansiyel müşterileri yakalayın, nitelendirin ve net bir satış sürecinde ilerletin.",
  },
  {
    icon: Bot,
    title: "AI satış desteği",
    description: "CRM bağlamıyla takip taslakları, görüşme özetleri ve teklif hazırlık notları üretin.",
  },
  {
    icon: Sparkles,
    title: "Profesyonel satış çalışma alanı",
    description: "Hız, netlik ve ölçeklenebilirlik için tasarlanmış modern bir CRM deneyimi kullanın.",
  },
];

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FlowSales AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "KOBİ'ler için AI destekli CRM, satış takibi, teklif, konuşma zekâsı ve çok kanallı satış çalışma alanı.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <main className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_26%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-12">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4 text-blue-600" />
            FlowSales AI
          </div>

          <h1 className="mt-8 text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Satış ekibiniz için AI destekli çalışma sistemi.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Lead, teklif, takip, görev, konuşma zekâsı ve ekip operasyonlarını tek bir güvenli çalışma alanında yönetin.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard" className="inline-flex h-12 items-center justify-center rounded-full bg-slate-950 px-6 text-sm font-medium text-white transition hover:bg-slate-800">
              Kontrol panelini aç
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <form action={startDemoAction}>
              <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-full border border-slate-200 bg-white/80 px-6 text-sm font-medium text-slate-900 shadow-sm backdrop-blur transition hover:bg-white sm:w-auto">
                Demoyu dene
              </button>
            </form>
          </div>
        </div>

        <div className="mt-20 grid gap-5 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Icon className="h-5 w-5" /></div>
                <h2 className="mt-6 text-xl font-semibold text-slate-950">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur md:grid-cols-3">
          <Stat label="Daha hızlı yanıt" value="7/24" detail="AI destekli taslaklar, özetler ve satış önerileri." />
          <Stat label="Daha temiz pipeline" value="Tek görünüm" detail="Lead'den teklife ve takibe kadar satış süreci tek yerde." />
          <Stat label="Çalışma alanı izolasyonu" value="RLS" detail="Organizasyon bazlı güvenli veri erişimi ve yetkilendirme." />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p><p className="mt-2 text-sm text-slate-600">{detail}</p></div>;
}
