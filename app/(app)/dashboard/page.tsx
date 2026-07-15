import {
  DollarSign,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";

import StatCard from "@/app/components/StatCard";

export default function DashboardPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Dashboard
        </h1>

        <p className="mt-2 text-slate-500">
          Welcome back, Çağatay 👋
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Revenue"
          value="₺245.000"
          change="+18% this month"
          icon={DollarSign}
        />

        <StatCard
          title="Leads"
          value="18"
          change="+6 today"
          icon={Users}
        />

        <StatCard
          title="Quotes"
          value="9"
          change="3 pending approval"
          icon={FileText}
        />

        <StatCard
          title="Conversion"
          value="42%"
          change="+4.2%"
          icon={TrendingUp}
        />
      </div><div className="mt-8 grid gap-6 lg:grid-cols-2">
  <div className="rounded-2xl border bg-white p-6 shadow-sm">
    <h2 className="text-lg font-semibold">
      Recent Leads
    </h2>

    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <p className="font-medium">Ahmet Yılmaz</p>
          <p className="text-sm text-slate-500">
            56m² Garden Container
          </p>
        </div>

        <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
          New
        </span>
      </div>

      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <p className="font-medium">Mehmet Kaya</p>
          <p className="text-sm text-slate-500">
            Tiny House
          </p>
        </div>

        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs text-yellow-700">
          Quote Sent
        </span>
      </div>
    </div>
  </div>

  <div className="rounded-2xl border bg-white p-6 shadow-sm">
    <h2 className="text-lg font-semibold">
      AI Suggestions
    </h2>

    <div className="mt-6 space-y-4 text-sm">
      <div className="rounded-xl bg-slate-100 p-4">
        Contact Ahmet today.
      </div>

      <div className="rounded-xl bg-slate-100 p-4">
        Mehmet opened the quote twice.
      </div>

      <div className="rounded-xl bg-slate-100 p-4">
        Follow up with 3 inactive leads.
      </div>
    </div>
  </div>
</div>
    </>
  );
}