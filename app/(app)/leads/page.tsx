export const dynamic = "force-dynamic";

import NewLeadForm from "@/components/NewLeadForm";
import { getLeads } from "@/lib/supabase/leads";

export default async function LeadsPage() {
  const leads = await getLeads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Leads
        </h1>

        <p className="mt-2 text-slate-500">
          Manage your potential customers.
        </p>
      </div>

      <NewLeadForm />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-900">
            All Leads
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Value</th>
              </tr>
            </thead>

            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-slate-100">
                  <td className="px-6 py-4">{lead.name}</td>
                  <td className="px-6 py-4">{lead.company ?? "—"}</td>
                  <td className="px-6 py-4">{lead.source ?? "—"}</td>
                  <td className="px-6 py-4">{lead.status ?? "—"}</td>
                  <td className="px-6 py-4">{lead.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
