import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Zona del local: «hoy» se cuenta en hora de Zúrich, no en la del servidor (D4). */
export const SHOP_TIME_ZONE = "Europe/Zurich";

/** Instante UTC en que empezó el día en curso en la zona del local. */
export function startOfShopDay(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SHOP_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  // Diferencia entre la hora de pared de Zúrich y UTC en este instante.
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMs);
}

/**
 * Cantidad comprometida hoy por producto: líneas de pedidos confirmados desde el inicio del
 * día del local. Aproxima «confirmado y no entregado», que no existe sin US-13 (D4).
 */
export async function committedToday(
  productIds: string[],
  client: Prisma.TransactionClient | typeof db = db,
): Promise<Map<string, Prisma.Decimal>> {
  if (productIds.length === 0) return new Map();
  const rows = await client.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: { status: "CONFIRMED", confirmedAt: { gte: startOfShopDay() } },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId!, new Prisma.Decimal(r._sum.quantity ?? 0)]));
}
