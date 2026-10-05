import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidQuantity, lineTotalCents } from "./pricing";

export type EditResult =
  | { ok: true }
  | { ok: false; code: "ORDER_NOT_DRAFT" | "NOT_FOUND" | "INVALID_QUANTITY" | "UNRESOLVED_LINE" | "ALREADY_RESOLVED" };

type Tx = Prisma.TransactionClient;

class EditRejected extends Error {
  constructor(readonly code: Exclude<EditResult, { ok: true }>["code"]) {
    super(code);
  }
}

/**
 * Toda edición corre en una transacción que primero bloquea el Order con un updateMany
 * condicional a DRAFT: si otro empleado lo confirmó, se rechaza; si se está confirmando,
 * espera y luego se rechaza. confirmOrder toma el mismo bloqueo.
 */
async function editDraft(orderId: string, edit: (tx: Tx) => Promise<void>): Promise<EditResult> {
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: "DRAFT" },
        data: { updatedAt: new Date() },
      });
      if (count === 0) {
        const exists = await tx.order.count({ where: { id: orderId } });
        throw new EditRejected(exists ? "ORDER_NOT_DRAFT" : "NOT_FOUND");
      }
      await edit(tx);
      await recalculateTotal(tx, orderId);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof EditRejected) return { ok: false, code: error.code };
    throw error;
  }
}

async function recalculateTotal(tx: Tx, orderId: string) {
  const { _sum } = await tx.orderItem.aggregate({ where: { orderId }, _sum: { lineTotalCents: true } });
  await tx.order.update({ where: { id: orderId }, data: { totalCents: _sum.lineTotalCents ?? 0 } });
}

/** Importe y aviso de disponibilidad siempre contra la base, nunca contra lo que mande el cliente. */
function priceLine(product: { pricePerUnitCents: number; stockQuantity: Prisma.Decimal }, quantity: Prisma.Decimal) {
  return {
    quantity,
    lineTotalCents: lineTotalCents(quantity, product.pricePerUnitCents),
    hasStockWarning: quantity.gt(product.stockQuantity),
  };
}

export function updateLineQuantity(orderId: string, itemId: string, quantity: string) {
  return editDraft(orderId, async (tx) => {
    const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId }, include: { product: true } });
    if (!item) throw new EditRejected("NOT_FOUND");
    if (!item.product) throw new EditRejected("UNRESOLVED_LINE");
    const q = new Prisma.Decimal(quantity);
    if (!isValidQuantity(item.product.unit, q)) throw new EditRejected("INVALID_QUANTITY");
    // Al cambiar sólo la cantidad se conserva el precio copiado al crear la línea (decisión 4 de §3).
    await tx.orderItem.update({
      where: { id: itemId },
      data: { ...priceLine({ ...item.product, pricePerUnitCents: item.unitPriceCents }, q) },
    });
  });
}

export function removeLine(orderId: string, itemId: string) {
  return editDraft(orderId, async (tx) => {
    const { count } = await tx.orderItem.deleteMany({ where: { id: itemId, orderId } });
    if (count === 0) throw new EditRejected("NOT_FOUND");
  });
}

export function addLine(orderId: string, productId: string, quantity: string) {
  return editDraft(orderId, async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new EditRejected("NOT_FOUND");
    const q = new Prisma.Decimal(quantity);
    if (!isValidQuantity(product.unit, q)) throw new EditRejected("INVALID_QUANTITY");
    await tx.orderItem.create({
      data: {
        orderId,
        productId,
        rawText: "añadido por el empleado",
        unitPriceCents: product.pricePerUnitCents,
        ...priceLine(product, q),
      },
    });
  });
}

/**
 * Asigna a mano un producto a una mención que el intérprete no reconoció. Conserva el texto
 * original del cliente y toma el precio vigente del catálogo en ese momento.
 */
export function resolveLine(orderId: string, itemId: string, productId: string, quantity: string) {
  return editDraft(orderId, async (tx) => {
    const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new EditRejected("NOT_FOUND");
    if (item.productId) throw new EditRejected("ALREADY_RESOLVED");
    const product = await tx.product.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new EditRejected("NOT_FOUND");
    const q = new Prisma.Decimal(quantity);
    if (!isValidQuantity(product.unit, q)) throw new EditRejected("INVALID_QUANTITY");
    await tx.orderItem.update({
      where: { id: itemId },
      data: { productId, unitPriceCents: product.pricePerUnitCents, ...priceLine(product, q) },
    });
  });
}
