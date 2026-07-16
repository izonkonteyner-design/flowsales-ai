import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { updateProductAction } from "@/app/(app)/products/actions";
import { ProductForm } from "@/components/products/product-form";
import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getProductDetailData } from "@/server/services/products";
import { getProductRecordRestrictionMessage } from "@/server/services/product-domain";

type ProductEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductEditPage({ params, searchParams }: ProductEditPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const data = await getProductDetailData(id);
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : `/products/${id}`;
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const restriction = data.product ? getProductRecordRestrictionMessage(data.product.recordMode, data.context.role) : "";
  const editable = data.product ? !restriction : false;

  if (data.error && !data.product) {
    return (
      <div className="space-y-6">
        {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
        <PageHeader
          eyebrow="Catalog"
          title="Edit product"
          description="Update catalog pricing and metadata."
          actions={
            <Link href="/products" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back to catalog
            </Link>
          }
        />
        <EmptyState title="Product not available" description={data.error} actionHref="/products" actionLabel="Back to catalog" />
      </div>
    );
  }

  if (!data.product) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Catalog"
        title={`Edit ${data.product.name}`}
        description="Keep the approved catalog current."
        actions={
          <Link href={`/products/${data.product.id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      <SectionCard title="Product details" description="Edit the record with server-side validation and workspace checks.">
        <ProductForm
          action={updateProductAction}
          redirectTo={redirectTo}
          product={data.product}
          productId={data.product.id}
          submitLabel="Save changes"
          editable={editable}
          restrictionMessage={restriction || undefined}
        />
      </SectionCard>
    </div>
  );
}
