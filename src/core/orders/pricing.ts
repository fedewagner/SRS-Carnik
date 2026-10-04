import { Prisma, type ProductUnit } from "@prisma/client";

/** Importe de la línea en céntimos: cantidad exacta × precio unitario, redondeo half-up (D3). */
export function lineTotalCents(quantity: Prisma.Decimal.Value, unitPriceCents: number): number {
  return new Prisma.Decimal(quantity)
    .mul(unitPriceCents)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Las piezas son enteras; el peso admite hasta gramos. */
export function isValidQuantity(unit: ProductUnit, quantity: Prisma.Decimal.Value): boolean {
  const q = new Prisma.Decimal(quantity);
  if (q.lte(0)) return false;
  if (unit === "PIECE") return q.isInteger();
  return q.decimalPlaces() <= 3;
}

/** Normaliza la cantidad propuesta a lo que admite la unidad del producto. */
export function normalizeQuantity(unit: ProductUnit, quantity: number): Prisma.Decimal {
  const q = new Prisma.Decimal(quantity);
  return unit === "PIECE"
    ? q.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    : q.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function formatChf(cents: number): string {
  return `CHF ${(cents / 100).toFixed(2)}`;
}
