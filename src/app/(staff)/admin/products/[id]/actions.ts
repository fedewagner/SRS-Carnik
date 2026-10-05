"use server";

import { revalidatePath } from "next/cache";
import { changePrice } from "@/core/catalog/products";
import { adjustToCount, registerIntake, type StockResult } from "@/core/catalog/stock";
import type { UserRole } from "@prisma/client";
import { requireRole, STAFF, UnauthorizedError, type AuthenticatedUser } from "@/lib/auth/guard";
import { AdjustSchema, ChangePriceSchema, IntakeSchema } from "@/lib/validation/catalog";
import { PRODUCT_MESSAGES, type CatalogActionState } from "../messages";

const STOCK_MESSAGES: Record<Exclude<StockResult, { ok: true }>["code"], string> = {
  NOT_FOUND: "El producto ya no existe. Recargá la página.",
  INVALID_QUANTITY: "Cantidad no válida para la unidad del producto (piezas enteras, kg hasta gramos).",
  STALE: "Las existencias cambiaron mientras contabas (se confirmó un pedido o hubo un ingreso). Revisá los valores actualizados y volvé a guardar.",
  BELOW_COMMITTED: "Lo contado no cubre lo comprometido hoy en pedidos confirmados.",
  REASON_REQUIRED: "Indicá el motivo del reajuste.",
};

async function authorize(roles: UserRole[]): Promise<AuthenticatedUser | null> {
  try {
    return await requireRole(roles);
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  }
}

function done(productId: string, message: string): CatalogActionState {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  return { ok: message };
}

/** Cambio de precio: sólo ADMIN; revalora los borradores abiertos (D3). */
export async function changePriceAction(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  if (!(await authorize(["ADMIN"]))) return { error: "Sólo el administrador puede cambiar precios." };
  const parsed = ChangePriceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const result = await changePrice(parsed.data.productId, parsed.data.price);
  if (!result.ok) return { error: PRODUCT_MESSAGES[result.code] };
  return done(parsed.data.productId, "Precio actualizado; los borradores abiertos se revaloraron.");
}

export async function intakeAction(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await authorize(STAFF);
  if (!user) return { error: "Sesión caducada. Volvé a entrar." };
  const parsed = IntakeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const result = await registerIntake(parsed.data.productId, parsed.data.quantity, user.userId);
  if (!result.ok) return { error: STOCK_MESSAGES[result.code] };
  return done(parsed.data.productId, "Ingreso registrado.");
}

export async function adjustAction(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await authorize(STAFF);
  if (!user) return { error: "Sesión caducada. Volvé a entrar." };
  const parsed = AdjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const result = await adjustToCount(parsed.data, user.userId);
  if (!result.ok) {
    // Con STALE la página se revalida para que el formulario muestre los valores frescos.
    if (result.code === "STALE") revalidatePath(`/admin/products/${parsed.data.productId}`);
    return { error: STOCK_MESSAGES[result.code] };
  }
  return done(parsed.data.productId, "Reajuste registrado.");
}
