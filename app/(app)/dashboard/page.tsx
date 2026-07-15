"use client";

import {
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area as RechartsArea,
} from "recharts";
import { DollarSign, FileText, TrendingUp, Users } from "lucide-react";

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
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
          Dashboard
        </h1>

        <p className="mt-2 text-slate-500">
          Welcome back. Here is the latest activity across your workspace.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Revenue"
          value="₺245,000"
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

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-950">
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
                  `₺${Number(value).toLocaleString("en-US")}`,
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
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Recent Leads</h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-medium text-slate-950">Ahmet Yilmaz</p>
                <p className="text-sm text-slate-500">56m² Garden Container</p>
              </div>

              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                New
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-medium text-slate-950">Mehmet Kaya</p>
                <p className="text-sm text-slate-500">Tiny House</p>
              </div>

              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
                Quote Sent
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">AI Suggestions</h2>

          <div className="mt-6 space-y-4 text-sm">
            <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
              Contact Ahmet today.
            </div>

            <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
              Mehmet opened the quote twice.
            </div>

            <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
              Follow up with 3 inactive leads.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
