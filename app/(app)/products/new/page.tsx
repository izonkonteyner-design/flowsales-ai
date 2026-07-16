import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createProductAction } from "@/app/(app)/products/actions";
import { ProductForm } from "@/components/products/product-form";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getProductPageData } from "@/server/services/products";

type ProductNewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductNewPage({ searchParams }: ProductNewPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getProductPageData({});
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : "/products";
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Catalog"
        title="New product"
        description="Create a live product that can power future quotes."
        actions={
          <Link href="/products" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Back to catalog
          </Link>
        }
      />

      <SectionCard title="Product details" description="Use the validated form to add an organization-scoped catalog item.">
        <ProductForm
          action={createProductAction}
          redirectTo={redirectTo}
          submitLabel="Create product"
          editable={data.context.mode === "live" && (data.context.role === "owner" || data.context.role === "admin")}
          restrictionMessage={data.context.mode === "demo"
            ? "Connect live Supabase data before creating or editing products."
            : undefined}
        />
      </SectionCard>
    </div>
  );
}
