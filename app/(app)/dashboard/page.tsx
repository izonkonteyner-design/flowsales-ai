"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area as RechartsArea,
} from "recharts";

import {
  DollarSign,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";

import StatCard from "@/app/components/StatCard";

const salesData = [
  { month: "Jan", sales: 120000 },
  { month: "Feb", sales: 180000 },
  { month: "Mar", sales: 150000 },
  { month: "Apr", sales: 220000 },
  { month: "May", sales: 245000 },
  { month: "Jun", sales: 310000 },
];

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
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Sales Overview
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Monthly sales performance
          </p>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesData}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              <XAxis dataKey="month" axisLine={false} tickLine={false} />

              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `₺${value / 1000}K`}
              />

              <Tooltip
                formatter={(value) => [
                  `₺${Number(value).toLocaleString("tr-TR")}`,
                  "Sales",
                ]}
              />

              <RechartsArea
                type="monotone"
                dataKey="sales"
                stroke="#2563eb"
                strokeWidth={3}
                fill="url(#salesGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent Leads</h2>

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
          <h2 className="text-lg font-semibold">AI Suggestions</h2>

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