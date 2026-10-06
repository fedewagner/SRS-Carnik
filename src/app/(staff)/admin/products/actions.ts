"use server";

import { revalidatePath } from "next/cache";
import { createProduct } from "@/core/catalog/products";
import { requireRole, UnauthorizedError } from "@/lib/auth/guard";
import { CreateProductSchema } from "@/lib/validation/catalog";
import { PRODUCT_MESSAGES, type CatalogActionState } from "./messages";

/** Alta de producto: sólo ADMIN. requireRole es la primera línea, como en toda server action (D6). */
export async function createProductAction(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  let userId: string;
  try {
    ({ userId } = await requireRole(["ADMIN"]));
  } catch (error) {
    if (error instanceof UnauthorizedError) return { error: "Sólo el administrador puede dar de alta productos." };
    throw error;
  }
  const parsed = CreateProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const { name, unit, price, initialStock } = parsed.data;
  const result = await createProduct({ name, unit, priceCents: price, initialStock: initialStock || undefined }, userId);
  if (!result.ok) return { error: PRODUCT_MESSAGES[result.code] };
  revalidatePath("/admin/products");
  return { ok: `«${name}» dado de alta.` };
}
