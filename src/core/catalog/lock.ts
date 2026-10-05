import type { Prisma } from "@prisma/client";

/**
 * Bloquea la fila del Product hasta el fin de la transacción y la devuelve fresca (D2).
 * Prisma no expone FOR UPDATE; es el único SQL crudo de escritura de existencias.
 * Quien bloquee varios productos lo hace en orden de id para no cruzarse con otra transacción.
 */
export async function lockProduct(tx: Prisma.TransactionClient, productId: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  if (locked.length === 0) return null;
  return tx.product.findUniqueOrThrow({ where: { id: productId } });
}
