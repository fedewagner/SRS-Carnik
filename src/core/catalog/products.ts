import { Prisma, type ProductUnit } from "@prisma/client";
import { db } from "@/lib/db";
import { normalize } from "@/core/drafting/rules";
import { isValidQuantity, lineTotalCents } from "@/core/orders/pricing";

export type ProductResult =
  | { ok: true; productId: string }
  | { ok: false; code: "NOT_FOUND" | "DUPLICATE" | "INVALID_QUANTITY" | "INVALID_NAME" };

/** Slug sin acentos ni mayúsculas: «Entrecôt» y «entrecot» chocan en el índice único. */
export function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Alta de producto. Las existencias iniciales, si las hay, entran como un INTAKE. */
export async function createProduct(
  input: { name: string; unit: ProductUnit; priceCents: number; initialStock?: string },
  userId: string,
): Promise<ProductResult> {
  const name = input.name.trim();
  const slug = slugify(name);
  if (!slug) return { ok: false, code: "INVALID_NAME" };
  const initial = new Prisma.Decimal(input.initialStock || 0);
  if (!initial.isZero() && !isValidQuantity(input.unit, initial)) return { ok: false, code: "INVALID_QUANTITY" };

  try {
    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { slug, name, unit: input.unit, pricePerUnitCents: input.priceCents, stockQuantity: initial },
      });
      if (!initial.isZero()) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            userId,
            type: "INTAKE",
            previousQuantity: 0,
            quantityDelta: initial,
            resultingQuantity: initial,
          },
        });
      }
      return created;
    });
    return { ok: true, productId: product.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, code: "DUPLICATE" };
    }
    throw error;
  }
}

/**
 * Cambio de precio que revalora los borradores abiertos (D3). Bloquea cada Order con el
 * mismo updateMany condicional que editDraft y confirmOrder, en orden de id, y escribe el
 * Product al final: Order antes que Product, como confirmOrder, para no cruzarse con ella.
 * Un borrador que otro confirmó entretanto se salta y conserva su precio.
 */
export async function changePrice(productId: string, priceCents: number): Promise<ProductResult> {
  const exists = await db.product.count({ where: { id: productId } });
  if (!exists) return { ok: false, code: "NOT_FOUND" };

  await db.$transaction(async (tx) => {
    const drafts = await tx.order.findMany({
      where: { status: "DRAFT", items: { some: { productId } } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const { id: orderId } of drafts) {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: "DRAFT" },
        data: { updatedAt: new Date() },
      });
      if (count === 0) continue;
      const items = await tx.orderItem.findMany({ where: { orderId, productId } });
      for (const item of items) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { unitPriceCents: priceCents, lineTotalCents: lineTotalCents(item.quantity, priceCents) },
        });
      }
      const { _sum } = await tx.orderItem.aggregate({ where: { orderId }, _sum: { lineTotalCents: true } });
      await tx.order.update({ where: { id: orderId }, data: { totalCents: _sum.lineTotalCents ?? 0 } });
    }
    await tx.product.update({ where: { id: productId }, data: { pricePerUnitCents: priceCents } });
  });
  return { ok: true, productId };
}
