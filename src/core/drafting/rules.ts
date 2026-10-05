import { PRODUCT_ALIASES } from "./aliases";
import { intentByRules } from "./intent";
import type { DraftLine } from "./schema";
import type { CatalogEntry, DraftResult, OrderDrafter } from "./types";

// La coma separa líneas salvo entre dígitos ("2,5 kg" es una cantidad, no dos líneas).
const SEGMENT_SEPARATOR = /,(?!\d)|(?<!\d),|;|\n|\+|\s+y\s+|\s+e\s+/i;
// Un fragmento sin producto que habla de dinero no es una línea de pedido.
const PRICE_TALK = /\b(chf|fr|francos?|precio|cuesta|vale)\b/;
const QUANTITY = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos)?\b/;

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function findProduct(segment: string, catalog: CatalogEntry[]): CatalogEntry | null {
  let best: { entry: CatalogEntry; length: number } | null = null;
  for (const entry of catalog) {
    const aliases = PRODUCT_ALIASES[entry.slug] ?? [normalize(entry.name)];
    for (const alias of aliases) {
      const matches = new RegExp(`\\b${alias}\\b`).test(segment);
      if (matches && (!best || alias.length > best.length)) {
        best = { entry, length: alias.length };
      }
    }
  }
  return best?.entry ?? null;
}

function parseQuantity(segment: string, entry: CatalogEntry | null): number | null {
  const match = segment.match(QUANTITY);
  if (match) {
    const value = Number(match[1].replace(",", "."));
    const unit = match[2];
    if (unit && /^(g|gr|gramos)$/.test(unit)) return value / 1000;
    return value;
  }
  if (/\bmedio\b/.test(segment) && entry?.unit === "WEIGHT_KG") return 0.5;
  if (/\b(un|una|uno)\b/.test(segment)) return 1;
  return entry ? 1 : null;
}

/** Fragmento original desde la primera cifra, para que el empleado vea lo que escribió el cliente. */
function rawTextOf(original: string): string {
  const trimmed = original.trim();
  const firstDigit = trimmed.search(/\d/);
  return firstDigit > 0 ? trimmed.slice(firstDigit) : trimmed;
}

/** Intérprete determinista: cantidad + unidad + alias de producto. Sin red (D8). */
export class RuleBasedOrderDrafter implements OrderDrafter {
  async draft(text: string, catalog: CatalogEntry[]): Promise<DraftResult> {
    const lines: DraftLine[] = [];
    for (const original of text.split(SEGMENT_SEPARATOR)) {
      const segment = normalize(original);
      const entry = findProduct(segment, catalog);
      const quantity = parseQuantity(segment, entry);
      if (quantity === null || quantity <= 0) continue;
      if (!entry && !QUANTITY.test(segment)) continue;
      // "el entrecot cuesta 0,10 CHF" habla de dinero, no pide nada: sin unidad de peso se descarta.
      if (PRICE_TALK.test(segment) && !segment.match(QUANTITY)?.[2]) continue;
      lines.push({ productSlug: entry?.slug ?? null, rawText: rawTextOf(original), quantity });
    }
    return { intent: intentByRules(text, lines.length), lines, origin: "FALLBACK" };
  }
}
