import { formatChf } from "@/core/orders/pricing";

/**
 * Respuestas automáticas al cliente. Todas salen de textos fijos completados con datos de la base:
 * ningún texto del LLM ni del mensaje del cliente llega aquí (C3). Sólo la respuesta de catálogo
 * menciona precios y disponibilidad, y nunca totales ni cantidades de existencias (A3).
 */

export type ReplyLine = { quantity: number; unit: "WEIGHT_KG" | "PIECE"; productName: string };

/** Marca de la sugerencia de repetir; un «sí» sólo cuenta como repetición tras ella (C4). */
export const REPEAT_OFFER_PREFIX = "¿Lo de siempre?";

const EXAMPLE = "Por ejemplo: «2 kg de entrecot y 6 salchichas».";

function formatLine(line: ReplyLine): string {
  const qty = line.unit === "PIECE" ? `${line.quantity} u.` : `${line.quantity} kg`;
  return `${qty} ${line.productName}`;
}

function enumerate(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function firstName(profileName: string | null | undefined): string | null {
  const name = profileName?.trim().split(/\s+/)[0];
  // Sólo un nombre plausible: el perfil lo elige el cliente y no se reenvía cualquier cosa.
  return name && /^\p{L}[\p{L}'-]{0,29}$/u.test(name) ? name : null;
}

export function ackReply(lines: ReplyLine[], unresolved: string[]): string {
  const parts = ["¡Gracias! Recibimos tu pedido."];
  if (lines.length) parts.push(`Anotamos: ${enumerate(lines.map(formatLine))}.`);
  if (unresolved.length) parts.push(`Revisamos a mano: ${enumerate(unresolved.map((t) => `«${t}»`))}.`);
  parts.push("Te confirmamos el detalle en breve.");
  return parts.join(" ");
}

export function greetingReply(profileName: string | null | undefined, lastOrder: ReplyLine[] | null): string {
  const name = firstName(profileName);
  const hello = name ? `¡Hola ${name}!` : "¡Hola!";
  if (lastOrder?.length) {
    return `${hello} ${REPEAT_OFFER_PREFIX} ${enumerate(lastOrder.map(formatLine))}. Respondé «sí» y lo anotamos, o escribinos qué te preparamos hoy.`;
  }
  return `${hello} ¿Qué te preparamos hoy? ${EXAMPLE}`;
}

export function questionReply(): string {
  return "¡Gracias por escribir! Una persona del equipo te responde en breve.";
}

export type CatalogAnswerItem = {
  productName: string;
  unit: "WEIGHT_KG" | "PIECE";
  pricePerUnitCents: number;
  available: boolean;
};

/** Precio vigente y disponibilidad cualitativa: nunca la cantidad en stock ni una reserva (A3). */
export function catalogAnswerReply(items: CatalogAnswerItem[]): string {
  const lines = items.map((item) => {
    const per = item.unit === "PIECE" ? "por unidad" : "por kg";
    const availability = item.available ? "hay disponible" : "hoy no nos queda";
    return `• ${item.productName}: ${formatChf(item.pricePerUnitCents)} ${per}, ${availability}.`;
  });
  return [
    "¡Gracias por escribir! Precios de hoy:",
    ...lines,
    `Es el precio vigente; la consulta no reserva mercadería. Para pedir, escribinos la cantidad. ${EXAMPLE}`,
    "Cualquier otra duda te la responde una persona del equipo.",
  ].join("\n");
}

export function noHistoryReply(): string {
  return `No encontramos un pedido anterior tuyo. ¿Nos escribís qué querés? ${EXAMPLE}`;
}

export function skippedProductsNote(names: string[]): string {
  return names.length ? ` Hoy no tenemos ${enumerate(names)}.` : "";
}
