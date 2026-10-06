import type { ProductUnit } from "@prisma/client";
import type { DraftLine, Intent } from "./schema";

export type CatalogEntry = {
  slug: string;
  name: string;
  unit: ProductUnit;
};

export type DraftResult = {
  intent: Intent;
  lines: DraftLine[];
  /** Slugs del catálogo activo consultados por precio o disponibilidad (A1). */
  askedProducts: string[];
  origin: "AI" | "FALLBACK";
};

/** La AI propone; nunca ve precios ni existencias y nunca escribe en la base (D8, D9). */
export interface OrderDrafter {
  draft(text: string, catalog: CatalogEntry[]): Promise<DraftResult>;
}
