import type { ProductUnit } from "@prisma/client";
import type { DraftLine } from "./schema";

export type CatalogEntry = {
  slug: string;
  name: string;
  unit: ProductUnit;
};

export type DraftResult = {
  lines: DraftLine[];
  origin: "AI" | "FALLBACK";
};

/** La AI propone; nunca ve precios ni existencias y nunca escribe en la base (D8, D9). */
export interface OrderDrafter {
  draft(text: string, catalog: CatalogEntry[]): Promise<DraftResult>;
}
