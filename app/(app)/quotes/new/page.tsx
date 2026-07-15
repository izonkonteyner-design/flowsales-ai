import Link from "next/link";
import { ArrowLeft, Plus, Save } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { getLeads, getProducts } from "@/server/services/crm-data";

export default function NewQuotePage() {
  const leads = getLeads();
  const products = getProducts();

  const subtotal = products[0]?.base_price ?? 0;
  const tax = subtotal * 0.2;
  const total = subtotal + tax;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial"
        title="New quote"
        description="Draft a professional offer with lead linkage, line items, and structured terms."
        actions={
          <Link
            href="/quotes"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to quotes
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Quote details" description="Enter the commercial data that will appear on the proposal.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input placeholder="Quote number" defaultValue="FSA-2026-0145" />
            <Select defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </Select>
            <Select>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.full_name} - {lead.company}
                </option>
              ))}
            </Select>
            <Input type="date" defaultValue="2026-07-15" />
            <Input type="date" defaultValue="2026-08-14" />
            <Select defaultValue="TRY">
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </div>

          <div className="mt-4 space-y-4">
            <Textarea placeholder="Payment terms" defaultValue="50% advance, 50% on delivery" />
            <Textarea placeholder="Delivery terms" defaultValue="Delivery within 21 business days" />
            <Textarea placeholder="Quote notes" defaultValue="Include installation, commissioning, and warranty terms." />
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Line items" description="Use approved product pricing to keep quotes accurate.">
            <div className="space-y-3">
              {products.slice(0, 3).map((product) => (
                <div
                  key={product.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{product.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{product.category}</p>
                    </div>
                    <Badge variant="secondary">{formatCurrency(product.base_price, product.currency)}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <Input defaultValue="1" />
                    <Input defaultValue={String(product.base_price)} />
                    <Input defaultValue="0" />
                  </div>
                </div>
              ))}
            </div>

            <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <Plus className="h-4 w-4" />
              Add line item
            </button>
          </SectionCard>

          <SectionCard title="Totals" description="Calculated using numeric amounts, not formatted strings.">
            <div className="space-y-3 text-sm">
              <Row label="Subtotal" value={formatCurrency(subtotal, "TRY")} />
              <Row label="Tax" value={formatCurrency(tax, "TRY")} />
              <Row label="Discount" value={formatCurrency(0, "TRY")} />
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950 dark:border-white/10 dark:text-white">
                <span>Total</span>
                <span>{formatCurrency(total, "TRY")}</span>
              </div>
            </div>

            <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <Save className="h-4 w-4" />
              Save quote draft
            </button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
    </div>
  );
}
