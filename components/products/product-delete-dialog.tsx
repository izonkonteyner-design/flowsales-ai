"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";

import { deleteProductAction } from "@/app/(app)/products/actions";
import { getProductRecordRestrictionMessage } from "@/server/services/product-domain";
import type { WorkspaceRole } from "@/lib/workspace-roles";

type ProductDeleteDialogProps = {
  productId: string;
  productName: string;
  redirectTo: string;
  recordMode: "demo" | "live";
  role?: WorkspaceRole | null;
};

export function ProductDeleteDialog({
  productId,
  productName,
  redirectTo,
  recordMode,
  role,
}: ProductDeleteDialogProps) {
  const [open, setOpen] = useState(false);
  const disabledReason = getProductRecordRestrictionMessage(recordMode, role);
  const disabled = Boolean(disabledReason);

  return (
    <>
      <button
        type="button"
        onClick={disabled ? undefined : () => setOpen(true)}
        disabled={disabled}
        title={disabledReason || undefined}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      >
        <Trash2 className="h-3 w-3" />
        Sil
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-delete-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="product-delete-title" className="text-base font-semibold text-foreground">
                  Ürünü Sil
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">{productName}</span> ürünü kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={deleteProductAction} className="mt-5 flex justify-end gap-2">
              <input type="hidden" name="product_id" value={productId} />
              <input type="hidden" name="redirect_to" value={redirectTo} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-md bg-rose-600 px-3 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition-colors"
              >
                Silmeyi Onayla
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
