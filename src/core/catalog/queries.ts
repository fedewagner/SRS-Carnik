import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { committedToday } from "./committed";

const ZERO = new Prisma.Decimal(0);

/** Catálogo activo con lo comprometido hoy por producto (D4). */
export async function listCatalog() {
  const products = await db.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const committed = await committedToday(products.map((p) => p.id));
  return products.map((p) => ({ ...p, committed: committed.get(p.id) ?? ZERO }));
}

/** Ficha del producto: datos, comprometido hoy e historial de movimientos, del más reciente. */
export async function getProductDetail(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      stockMovements: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        include: { user: { select: { email: true } }, order: { select: { id: true, reference: true } } },
      },
    },
  });
  if (!product) return null;
  const committed = (await committedToday([id])).get(id) ?? ZERO;
  return { ...product, committed };
}
