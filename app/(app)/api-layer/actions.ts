"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createApiKey, revokeApiKey } from "@/server/services/productivity";

export type ApiKeyActionState = { ok: boolean; message: string; secret?: string };

export async function createApiKeyAction(_state: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, message: "Anahtar adı en az 2 karakter olmalıdır." };
  try {
    const secret = await createApiKey(parsed.data.name, ["crm:read", "crm:write"]);
    revalidatePath("/api-layer");
    return { ok: true, message: "API anahtarı oluşturuldu. Bu değer yalnızca bir kez gösterilir.", secret };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "API anahtarı oluşturulamadı." };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  await revokeApiKey(id);
  revalidatePath("/api-layer");
}
