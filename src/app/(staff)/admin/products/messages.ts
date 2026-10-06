import type { ProductResult } from "@/core/catalog/products";

export type CatalogActionState = { error?: string; ok?: string };

export const PRODUCT_MESSAGES: Record<Exclude<ProductResult, { ok: true }>["code"], string> = {
  NOT_FOUND: "El producto ya no existe. Recargá la página.",
  DUPLICATE: "Ya existe un producto con ese nombre.",
  INVALID_QUANTITY: "Existencias no válidas para la unidad (piezas enteras, kg hasta gramos).",
  INVALID_NAME: "El nombre necesita al menos una letra o un número.",
};
