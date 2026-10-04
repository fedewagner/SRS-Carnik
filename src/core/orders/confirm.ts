import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendOutboundMessage } from "@/core/messaging/outbound";
import { formatChf } from "./pricing";

export type InsufficientLine = {
  orderItemId: string;
  productName: string;
  requested: string;
  available: string;
};

export type ConfirmResult =
  | { kind: "not_found" }
  | { kind: "insufficient_stock"; lines: InsufficientLine[] }
  | {
      kind: "confirmed";
      alreadyConfirmed: boolean;
      order: { id: string; reference: string; status: "CONFIRMED"; totalCents: number; confirmedAt: Date; confirmedByUserId: string };
      summaryMessage: { status: string; messageId: string } | null;
    };

class InsufficientStockError extends Error {}

/**
 * Confirmación en una transacción con updateMany condicional (D10):
 * 1. DRAFT → CONFIRMED sólo si sigue en DRAFT; count 0 significa que otro ya confirmó.
 * 2. Descuento de cada línea sólo si hay existencias; count 0 revierte todo.
 * El resumen al cliente se envía después del commit, nunca dentro (D12).
 */
export async function confirmOrder(orderId: string, userId: string): Promise<ConfirmResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) return { kind: "not_found" };

  const resolved = order.items.filter((i) => i.productId);

  try {
    const transitioned = await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: "DRAFT" },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedByUserId: userId },
      });
      if (count === 0) return false;

      for (const item of resolved) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId!, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (updated.count === 0) throw new InsufficientStockError();
      }
      return true;
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
    if (!transitioned) return { kind: "confirmed", alreadyConfirmed: true, order: result, summaryMessage: null };

    const summary = await sendOutboundMessage({
      conversationId: order.conversationId,
      body: buildSummary(order.reference, resolved, confirmed.totalCents),
    });
    return {
      kind: "confirmed",
      alreadyConfirmed: false,
      order: result,
      summaryMessage: { status: summary.status ?? "SENT", messageId: summary.id },
    };
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    // El updateMany no dice qué faltó: se relee para construir el detalle (trade-off de D10).
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
