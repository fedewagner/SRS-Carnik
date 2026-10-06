import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { DraftResult } from "@/core/drafting/types";
import { boundedQuantity, isValidLineQuantity, lineTotalCents, normalizeQuantity } from "./pricing";

type DraftSource = { customerId: string; conversationId: string; sourceMessageId: string };

/** Referencia legible: seis últimos caracteres del cuid en mayúsculas, única por construcción. */
export function referenceFromId(id: string): string {
  return id.slice(-6).toUpperCase();
}

/**
 * Crea el Order en DRAFT. Precios y disponibilidad salen de la base, nunca del intérprete (D9).
 * Las menciones sin resolver se conservan con importe cero para que el empleado las vea; también
 * las de cantidad fuera de rango (cero tras redondear o por encima del tope), que no se valoran.
 */
export async function createDraftOrder(source: DraftSource, draft: DraftResult) {
  const slugs = draft.lines.flatMap((l) => (l.productSlug ? [l.productSlug] : []));
  const products = await db.product.findMany({ where: { slug: { in: slugs }, isActive: true } });
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const items = draft.lines.map((line) => {
    const product = line.productSlug ? bySlug.get(line.productSlug) : undefined;
    const quantity = product && normalizeQuantity(product.unit, line.quantity);
    if (!product || !quantity || !isValidLineQuantity(product.unit, quantity)) {
      return {
        rawText: line.rawText,
        quantity: boundedQuantity(line.quantity),
        unitPriceCents: 0,
        lineTotalCents: 0,
      };
    }
    return {
      productId: product.id,
      rawText: line.rawText,
      quantity,
      unitPriceCents: product.pricePerUnitCents,
      lineTotalCents: lineTotalCents(quantity, product.pricePerUnitCents),
      hasStockWarning: quantity.gt(product.stockQuantity),
    };
  });

  const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        // Placeholder único hasta conocer el id; se sustituye en la misma transacción.
        reference: `tmp-${randomUUID()}`,
        ...source,
        draftedBy: draft.origin,
        totalCents,
        items: { create: items },
      },
    });
    return tx.order.update({
      where: { id: order.id },
      data: { reference: referenceFromId(order.id) },
      include: { items: { include: { product: true } } },
    });
  });
}
