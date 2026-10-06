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

/**
 * Tope de una línea de pedido. La cantidad la propone el intérprete a partir del texto del
 * cliente: sin tope, «600000 kg» desborda el total en céntimos (Int) y la ingesta falla.
 */
export const MAX_LINE_QUANTITY = 1000;

/** Cantidad admisible en una línea: válida para su unidad y dentro del tope. */
export function isValidLineQuantity(unit: ProductUnit, quantity: Prisma.Decimal.Value): boolean {
  return isValidQuantity(unit, quantity) && new Prisma.Decimal(quantity).lte(MAX_LINE_QUANTITY);
}

/** Cantidad de una mención sin resolver: sólo se acota para que quepa en Decimal(10,3). */
export function boundedQuantity(quantity: number): Prisma.Decimal {
  const q = new Prisma.Decimal(Number.isFinite(quantity) ? quantity : 0).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  return Prisma.Decimal.min(Prisma.Decimal.max(q, 0), MAX_LINE_QUANTITY);
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
