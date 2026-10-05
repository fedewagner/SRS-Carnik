import { Prisma, type ProductUnit } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidQuantity } from "@/core/orders/pricing";
import { committedToday } from "./committed";
import { lockProduct } from "./lock";

export type StockResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "INVALID_QUANTITY" | "STALE" | "BELOW_COMMITTED" | "REASON_REQUIRED" };

class StockRejected extends Error {
  constructor(readonly code: Exclude<StockResult, { ok: true }>["code"]) {
    super(code);
  }
}

/** Existencias admiten cero; por lo demás, las mismas reglas de unidad que una línea. */
function isValidStock(unit: ProductUnit, quantity: Prisma.Decimal): boolean {
  return quantity.isZero() || isValidQuantity(unit, quantity);
}

async function writeStock(productId: string, write: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await db.$transaction(write);
  } catch (error) {
    if (error instanceof StockRejected) return { ok: false, code: error.code } as const;
    throw error;
  }
  await refreshDraftWarnings(productId);
  return { ok: true } as const;
}

/**
 * Suma lo envasado a las existencias. Es un incremento sobre el valor bloqueado, no un
 * valor absoluto: una confirmación simultánea no se pierde.
 */
export function registerIntake(productId: string, quantity: string, userId: string): Promise<StockResult> {
  return writeStock(productId, async (tx) => {
    const product = await lockProduct(tx, productId);
    if (!product) throw new StockRejected("NOT_FOUND");
    const delta = new Prisma.Decimal(quantity);
    if (!isValidQuantity(product.unit, delta)) throw new StockRejected("INVALID_QUANTITY");
    const resulting = product.stockQuantity.add(delta);
    await tx.product.update({ where: { id: productId }, data: { stockQuantity: resulting } });
    await tx.stockMovement.create({
      data: {
        productId,
        userId,
        type: "INTAKE",
        previousQuantity: product.stockQuantity,
        quantityDelta: delta,
        resultingQuantity: resulting,
      },
    });
  });
}

/**
 * Reajuste por conteo físico: disponible = contado − comprometido hoy, recalculado aquí y
 * no tomado del formulario. Si las existencias cambiaron desde que el usuario abrió el
 * formulario (expected), se rechaza para no pisar una confirmación (D2).
 */
export function adjustToCount(
  input: { productId: string; counted: string; expected: string; reason: string },
  userId: string,
): Promise<StockResult> {
  return writeStock(input.productId, async (tx) => {
    const reason = input.reason.trim();
    if (!reason) throw new StockRejected("REASON_REQUIRED");
    const product = await lockProduct(tx, input.productId);
    if (!product) throw new StockRejected("NOT_FOUND");
    const counted = new Prisma.Decimal(input.counted);
    if (!isValidStock(product.unit, counted)) throw new StockRejected("INVALID_QUANTITY");
    if (!product.stockQuantity.equals(new Prisma.Decimal(input.expected))) throw new StockRejected("STALE");

    const committed = (await committedToday([product.id], tx)).get(product.id) ?? new Prisma.Decimal(0);
    const resulting = counted.sub(committed);
    if (resulting.isNegative()) throw new StockRejected("BELOW_COMMITTED");

    await tx.product.update({ where: { id: product.id }, data: { stockQuantity: resulting } });
    await tx.stockMovement.create({
      data: {
        productId: product.id,
        userId,
        type: "COUNT_ADJUSTMENT",
        previousQuantity: product.stockQuantity,
        quantityDelta: resulting.sub(product.stockQuantity),
        resultingQuantity: resulting,
        countedQuantity: counted,
        committedQuantity: committed,
        reason,
      },
    });
  });
}

/**
 * Recalcula el aviso de disponibilidad de las líneas en borrador del producto contra sus
 * existencias actuales (D5). Corre fuera de la transacción del stock, leyendo el valor
 * ya confirmado, para no retener el bloqueo del Product mientras espera filas de OrderItem
 * que una edición o un cambio de precio pueden tener tomadas.
 */
export async function refreshDraftWarnings(productId: string) {
  await db.$executeRaw`
    UPDATE "OrderItem" AS oi
    SET "hasStockWarning" = oi."quantity" > p."stockQuantity"
    FROM "Order" AS o, "Product" AS p
    WHERE oi."orderId" = o."id"
      AND oi."productId" = p."id"
      AND o."status" = 'DRAFT'
      AND p."id" = ${productId}`;
}
