import type { Prisma, ProductUnit } from "@prisma/client";

export const unitLabel = (unit: ProductUnit) => (unit === "PIECE" ? "u." : "kg");

export function formatStock(quantity: Prisma.Decimal, unit: ProductUnit): string {
  return unit === "PIECE" ? `${quantity.toFixed(0)} u.` : `${quantity.toFixed(3).replace(".", ",")} kg`;
}
