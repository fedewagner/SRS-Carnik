import { PRODUCT_ALIASES } from "./aliases";
import { intentByRules } from "./intent";
import type { DraftLine } from "./schema";
import type { CatalogEntry, DraftResult, OrderDrafter } from "./types";

// La coma separa líneas salvo entre dígitos ("2,5 kg" es una cantidad, no dos líneas).
const SEGMENT_SEPARATOR = /,(?!\d)|(?<!\d),|;|\n|\+|\s+y\s+|\s+e\s+/i;
// Un fragmento sin producto que habla de dinero no es una línea de pedido.
const PRICE_TALK = /\b(chf|fr|francos?|precio|cuesta|vale)\b/;
const QUANTITY = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos)?\b/;
// Pregunta por precio o disponibilidad (A2).
const CATALOG_QUESTION =
  /\b(cuanto|cuantos|cuanta|precios?|cuesta|cuestan|sale|salen|vale|valen|tienen|tenes|tiene|hay|queda|quedan|disponibles?)\b/;
// Expresión de pedido: con ella, toda mención de producto sigue siendo línea (C2).
const ORDER_SIGNAL =
  /\b(mand\w*|envi\w*|prepar\w*|reserv\w*|separ\w*|guard\w*|anot\w*|pone\w*|dame|deme|necesit\w*|quiero(?! saber)|queria(?! saber)|querria(?! saber)|pedido|para (hoy|manana|pasado|el|la|esta))\b/;

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

/**
 * Red de seguridad para la salida del LLM: si declara productos consultados sin líneas pero el
 * mensaje trae una expresión de pedido («¿tenés entrecot para mañana?»), es pedido (C2, A7).
 * Se anotan con cantidad 1, como haría el intérprete por reglas, y el empleado la ajusta.
 */
export function promoteOrderSignal(result: DraftResult, text: string): DraftResult {
  if (result.lines.length > 0 || result.askedProducts.length === 0) return result;
  if (!ORDER_SIGNAL.test(normalize(text))) return result;
  const rawText = text.trim();
  return {
    ...result,
    intent: "ORDER",
    lines: result.askedProducts.map((productSlug) => ({ productSlug, rawText, quantity: 1 })),
    askedProducts: [],
  };
}

/** Intérprete determinista: cantidad + unidad + alias de producto. Sin red (D8). */
export class RuleBasedOrderDrafter implements OrderDrafter {
  async draft(text: string, catalog: CatalogEntry[]): Promise<DraftResult> {
    const lines: DraftLine[] = [];
    const asked = new Set<string>();
    const whole = normalize(text);
    // Una pregunta de precio o disponibilidad sin expresión de pedido no abre líneas sin cifra (A2).
    const isCatalogQuestion = CATALOG_QUESTION.test(whole) && !ORDER_SIGNAL.test(whole);
    for (const original of text.split(SEGMENT_SEPARATOR)) {
      const segment = normalize(original);
      const entry = findProduct(segment, catalog);
      if (entry && isCatalogQuestion && !QUANTITY.test(segment)) {
        asked.add(entry.slug);
        continue;
      }
      const quantity = parseQuantity(segment, entry);
      if (quantity === null || quantity <= 0) continue;
      if (!entry && !QUANTITY.test(segment)) continue;
      // "el entrecot cuesta 0,10 CHF" habla de dinero, no pide nada: sin unidad de peso se descarta.
      if (PRICE_TALK.test(segment) && !segment.match(QUANTITY)?.[2]) continue;
      lines.push({ productSlug: entry?.slug ?? null, rawText: rawTextOf(original), quantity });
    }
    const askedProducts = [...asked];
    return {
      intent: intentByRules(text, lines.length, askedProducts.length),
      lines,
      askedProducts,
      origin: "FALLBACK",
    };
  }
}
