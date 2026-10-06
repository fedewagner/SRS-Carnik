import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendOutboundMessage } from "@/core/messaging/outbound";
import { lockProduct } from "@/core/catalog/lock";
import { refreshDraftWarnings } from "@/core/catalog/stock";
import { formatChf } from "./pricing";

export type InsufficientLine = {
  orderItemId: string;
  productName: string;
  requested: string;
  available: string;
};

export type ConfirmResult =
  | { kind: "not_found" }
  | { kind: "no_lines" }
  | { kind: "insufficient_stock"; lines: InsufficientLine[] }
  | {
      kind: "confirmed";
      alreadyConfirmed: boolean;
      order: { id: string; reference: string; status: "CONFIRMED"; totalCents: number; confirmedAt: Date; confirmedByUserId: string };
      summaryMessage: { status: string; messageId: string } | null;
    };

type ConfirmedItem = Prisma.OrderItemGetPayload<{ include: { product: true } }>;

/** Sin líneas con producto no hay nada que armar: confirmar sólo mandaría un total de cero. */
class NoLinesError extends Error {}

class InsufficientStockError extends Error {
  constructor(readonly items: ConfirmedItem[]) {
    super("INSUFFICIENT_STOCK");
  }
}

/**
 * Confirmación en una transacción con updateMany condicional (D10):
 * 1. DRAFT → CONFIRMED sólo si sigue en DRAFT; count 0 significa que otro ya confirmó.
 * 2. Descuento de cada línea sólo si hay existencias, con su StockMovement; si falta, revierte todo.
 * El resumen al cliente se envía después del commit, nunca dentro (D12).
 */
export async function confirmOrder(orderId: string, userId: string): Promise<ConfirmResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { conversationId: true } });
  if (!order) return { kind: "not_found" };

  try {
    const outcome = await db.$transaction(async (tx) => {
      // El updateMany bloquea la fila del Order: las ediciones de líneas toman el mismo
      // bloqueo, así que las líneas que se leen a continuación son las que se confirman.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: "DRAFT" },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedByUserId: userId },
      });
      if (count === 0) return null;

      const items = await tx.orderItem.findMany({
        where: { orderId, productId: { not: null } },
        include: { product: true },
        orderBy: { createdAt: "asc" },
      });
      if (items.length === 0) throw new NoLinesError();
      // Productos bloqueados en orden de id para no cruzarse con otra confirmación (D2 de
      // add-catalog-management); cada descuento deja su asiento en el libro de existencias.
      const byProduct = [...items].sort((a, b) => a.productId!.localeCompare(b.productId!));
      for (const item of byProduct) {
        const product = await lockProduct(tx, item.productId!);
        if (!product || product.stockQuantity.lt(item.quantity)) throw new InsufficientStockError(items);
        const resulting = product.stockQuantity.sub(item.quantity);
        await tx.product.update({ where: { id: product.id }, data: { stockQuantity: resulting } });
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            userId,
            orderId,
            type: "ORDER_CONFIRMED",
            previousQuantity: product.stockQuantity,
            quantityDelta: new Prisma.Decimal(item.quantity).neg(),
            resultingQuantity: resulting,
          },
        });
      }
      return items;
    });

    const confirmed = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const result = {
      id: confirmed.id,
      reference: confirmed.reference,
      status: "CONFIRMED" as const,
      totalCents: confirmed.totalCents,
      confirmedAt: confirmed.confirmedAt!,
      confirmedByUserId: confirmed.confirmedByUserId!,
    };
    if (!outcome) return { kind: "confirmed", alreadyConfirmed: true, order: result, summaryMessage: null };
    // El descuento cambia la disponibilidad que ven los demás borradores.
    for (const productId of new Set(outcome.map((i) => i.productId!))) await refreshDraftWarnings(productId);

    const summary = await sendOutboundMessage({
      conversationId: order.conversationId,
      body: buildSummary(confirmed.reference, outcome, confirmed.totalCents),
    });
    return {
      kind: "confirmed",
      alreadyConfirmed: false,
      order: result,
      summaryMessage: { status: summary.status ?? "SENT", messageId: summary.id },
    };
  } catch (error) {
    if (error instanceof NoLinesError) return { kind: "no_lines" };
    if (!(error instanceof InsufficientStockError)) throw error;
    // El updateMany no dice qué faltó: se relee para construir el detalle (trade-off de D10).
    const resolved = error.items;
    const fresh = await db.product.findMany({
      where: { id: { in: resolved.map((i) => i.productId!) } },
    });
    const stock = new Map(fresh.map((p) => [p.id, p.stockQuantity]));
    const lines = resolved
      .filter((i) => new Prisma.Decimal(i.quantity).gt(stock.get(i.productId!) ?? 0))
      .map((i) => ({
        orderItemId: i.id,
        productName: i.product!.name,
        requested: new Prisma.Decimal(i.quantity).toFixed(3),
        available: new Prisma.Decimal(stock.get(i.productId!) ?? 0).toFixed(3),
      }));
    return { kind: "insufficient_stock", lines };
  }
}

function buildSummary(
  reference: string,
  items: { quantity: Prisma.Decimal; product: { name: string; unit: string } | null; lineTotalCents: number }[],
  totalCents: number,
): string {
  const lines = items.map((i) => {
    const qty = i.product!.unit === "PIECE" ? `${Number(i.quantity)} u.` : `${Number(i.quantity)} kg`;
    return `• ${qty} ${i.product!.name} — ${formatChf(i.lineTotalCents)}`;
  });
  return [`¡Tu pedido ${reference} está confirmado!`, ...lines, `Total: ${formatChf(totalCents)}`].join("\n");
}
