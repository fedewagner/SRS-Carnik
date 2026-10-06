import { db } from "@/lib/db";
import { catalogAnswerReply } from "./replies";

/** Más productos que esto es pedir la lista de precios: la responde una persona (A4). */
export const MAX_ASKED_PRODUCTS = 5;

/**
 * Respuesta de catálogo para los slugs consultados, con datos releídos de `Product` (A4, A6).
 * Devuelve null si no queda ningún producto activo o si son demasiados: la ingesta envía
 * entonces el aviso neutro de atención humana.
 */
export async function catalogAnswerFor(slugs: string[]): Promise<string | null> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0 || unique.length > MAX_ASKED_PRODUCTS) return null;

  const products = await db.product.findMany({
    where: { slug: { in: unique }, isActive: true },
    select: { slug: true, name: true, unit: true, pricePerUnitCents: true, stockQuantity: true },
  });
  if (products.length === 0) return null;

  const order = new Map(unique.map((slug, i) => [slug, i]));
  products.sort((a, b) => order.get(a.slug)! - order.get(b.slug)!);
  return catalogAnswerReply(
    products.map((p) => ({
      productName: p.name,
      unit: p.unit,
      pricePerUnitCents: p.pricePerUnitCents,
      available: p.stockQuantity.gt(0),
    })),
  );
}
