import type { Prisma, ProductUnit } from "@prisma/client";

export const unitLabel = (unit: ProductUnit) => (unit === "PIECE" ? "u." : "kg");

/** Mismo formato que pedidos, cola de armado y mensajes al cliente: «1.5 kg», «6 u.». */
export function formatStock(quantity: Prisma.Decimal, unit: ProductUnit): string {
  return unit === "PIECE" ? `${quantity.toFixed(0)} u.` : `${quantity.toNumber()} kg`;
}
