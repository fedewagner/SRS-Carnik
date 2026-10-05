"use server";

import { revalidatePath } from "next/cache";
import { addLine, removeLine, updateLineQuantity, type EditResult } from "@/core/orders/editLines";
import { requireRole, STAFF, UnauthorizedError } from "@/lib/auth/guard";
import { AddLineSchema, RemoveLineSchema, UpdateLineSchema } from "@/lib/validation/orders";

export type LineActionState = { error?: string };

const MESSAGES: Record<Exclude<EditResult, { ok: true }>["code"], string> = {
  ORDER_NOT_DRAFT: "El pedido ya no está en borrador: no se puede editar.",
  NOT_FOUND: "La línea o el producto ya no existe. Recargá la página.",
  INVALID_QUANTITY: "Cantidad no válida para la unidad del producto (piezas enteras, kg hasta gramos).",
  UNRESOLVED_LINE: "Esta línea no tiene producto: eliminala y añadí el correcto.",
};

/**
 * Server actions del detalle. Son endpoints HTTP públicos: requireRole es la primera línea
 * de cada una y el estado del pedido se comprueba en la misma transacción que escribe (D5).
 */
async function run(
  formData: FormData,
  schema: typeof UpdateLineSchema | typeof RemoveLineSchema | typeof AddLineSchema,
  edit: (data: Record<string, string>) => Promise<EditResult>,
): Promise<LineActionState> {
  try {
    await requireRole(STAFF);
  } catch (error) {
    if (error instanceof UnauthorizedError) return { error: "Sesión caducada. Volvé a entrar." };
    throw error;
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos" };

  const data = parsed.data as Record<string, string>;
  const result = await edit(data);
  revalidatePath(`/admin/orders/${data.orderId}`);
  return result.ok ? {} : { error: MESSAGES[result.code] };
}

export async function updateLineAction(_prev: LineActionState, formData: FormData) {
  return run(formData, UpdateLineSchema, (d) => updateLineQuantity(d.orderId, d.itemId, d.quantity));
}

export async function removeLineAction(_prev: LineActionState, formData: FormData) {
  return run(formData, RemoveLineSchema, (d) => removeLine(d.orderId, d.itemId));
}

export async function addLineAction(_prev: LineActionState, formData: FormData) {
  return run(formData, AddLineSchema, (d) => addLine(d.orderId, d.productId, d.quantity));
}
