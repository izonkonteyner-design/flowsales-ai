import type { ComponentType } from "react";
import { BellRing, Languages, LockKeyhole, Palette, Settings2, Shield, UserRoundPlus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { getSupabaseEnv } from "@/lib/supabase/env";

export default function SettingsPage() {
  const env = getSupabaseEnv();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Configure your company profile, roles, AI behavior, and future billing-ready defaults."
        actions={<StatusBadge tone={env.url && env.anonKey ? "success" : "warning"}>{env.url && env.anonKey ? "Supabase configured" : "Configuration required"}</StatusBadge>}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Company profile" description="Basic workspace identity and operational defaults.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input defaultValue="FlowSales Demo Workspace" />
            <Input defaultValue="Istanbul, Turkey" />
            <Input defaultValue="owner@flowsales.ai" />
            <Input defaultValue="+90 212 000 0000" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select defaultValue="TRY">
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
            <Select defaultValue="en">
              <option value="en">English</option>
              <option value="tr">Türkçe (placeholder)</option>
            </Select>
          </div>
          <div className="mt-4">
            <Textarea defaultValue="Update company description, branding copy, and onboarding notes here." />
          </div>
        </SectionCard>

        <SectionCard title="AI assistant settings" description="Workspace prompt, safety constraints, and output style.">
          <div className="space-y-4">
            <Textarea defaultValue="Be precise. Never invent pricing. Ask for missing product or customer information before drafting a quote." />
            <Input defaultValue="Approved product catalog + workspace policies" />
            <Input defaultValue="Require human approval before sending or modifying sensitive data" />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Roles" description="Owner, admin, sales, and viewer controls.">
          <div className="space-y-3">
            <Pill icon={Shield} label="Owner" />
            <Pill icon={UserRoundPlus} label="Admin" />
            <Pill icon={Settings2} label="Sales" />
            <Pill icon={LockKeyhole} label="Viewer" />
          </div>
        </SectionCard>

        <SectionCard title="Appearance" description="Light and dark mode defaults.">
          <div className="space-y-3">
            <Pill icon={Palette} label="Theme toggle enabled" />
            <Pill icon={Languages} label="Localization ready" />
            <Pill icon={BellRing} label="Notifications placeholder" />
          </div>
        </SectionCard>

        <SectionCard title="Billing" description="Subscription scaffolding for future Stripe integration.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>Starter, Pro, and Business plan boundaries are documented in code and SQL.</p>
            <p>No live billing provider is connected yet, so the page remains safe and non-destructive.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}
