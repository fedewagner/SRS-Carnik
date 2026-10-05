import type { DraftLine } from "@/core/drafting/schema";
import type { ReplyLine } from "@/core/messaging/replies";
import { db } from "@/lib/db";

export type LastOrder = {
  reference: string;
  lines: (ReplyLine & { slug: string })[];
  /** Productos del último pedido que hoy están inactivos y no se repiten. */
  inactive: string[];
};

/** Último pedido confirmado del cliente. Sólo se usa dentro de su propia conversación (C6). */
export async function findLastConfirmedOrder(customerId: string): Promise<LastOrder | null> {
  const order = await db.order.findFirst({
    where: { customerId, status: "CONFIRMED" },
    orderBy: { confirmedAt: "desc" },
    include: { items: { where: { productId: { not: null } }, include: { product: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!order) return null;
  const items = order.items.filter((i) => i.product);
  return {
    reference: order.reference,
    lines: items
      .filter((i) => i.product!.isActive)
      .map((i) => ({ slug: i.product!.slug, productName: i.product!.name, unit: i.product!.unit, quantity: Number(i.quantity) })),
    inactive: items.filter((i) => !i.product!.isActive).map((i) => i.product!.name),
  };
}

/** Líneas para createDraftOrder: la valoración con precios y stock de hoy la hace ella (C5). */
export function repeatLines(last: LastOrder): DraftLine[] {
  return last.lines.map((l) => ({
    productSlug: l.slug,
    rawText: `repite ${last.reference}: ${l.quantity} ${l.unit === "PIECE" ? "u." : "kg"} ${l.productName}`,
    quantity: l.quantity,
  }));
}
