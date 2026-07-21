"use client";

import { useState } from "react";
import { completeOnboardingAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { CURRENCY_CODES } from "@/lib/constants";
import type { Organization } from "@/types/crm";

export function OnboardingForm({ organization }: { organization: Organization }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    try {
      await completeOnboardingAction(formData);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50">
      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-slate-950 dark:text-white">Workspace Details</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Basic information about your company.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">Company Name</span>
            <Input name="company_name" defaultValue={organization.name} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">Industry (Optional)</span>
            <Input name="industry" placeholder="e.g. Software, Manufacturing" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">Base Currency</span>
            <Select name="currency" defaultValue={organization.currency || "TRY"}>
              {CURRENCY_CODES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">Company Logo (Optional)</span>
            <Input name="logo" type="file" accept="image/png, image/jpeg, image/webp" />
          </label>
        </div>
      </div>

      <div className="my-8 h-px bg-slate-200 dark:bg-white/10" />

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-slate-950 dark:text-white">Quick Setup (Optional)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Add your first product and lead to get started instantly.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">First Product Name</span>
            <Input name="product_name" placeholder="e.g. Professional Services" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">Base Price</span>
            <Input name="product_price" type="number" step="0.01" placeholder="0.00" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">First Lead Name</span>
            <Input name="lead_name" placeholder="e.g. Jane Doe" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-300">Lead Company</span>
            <Input name="lead_company" placeholder="e.g. Acme Corp" />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-4">
        <Link href="/dashboard" className={buttonVariants({ variant: "ghost" })}>
          Skip for now
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Complete Setup"}
        </Button>
      </div>
    </form>
  );
}
