/**
 * Respuestas automáticas al cliente. Todas salen de textos fijos completados con datos de la base:
 * ningún texto del LLM ni del mensaje del cliente llega aquí (C3). Ninguna menciona precios,
 * totales ni disponibilidad.
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

export function noHistoryReply(): string {
  return `No encontramos un pedido anterior tuyo. ¿Nos escribís qué querés? ${EXAMPLE}`;
}

/** Aviso fijo al superar el límite de mensajes; se envía una vez por ventana (US-03). */
export function rateLimitReply(): string {
  return "Recibimos muchos mensajes tuyos seguidos. Quedan anotados y una persona del equipo los revisa en breve.";
}

export function skippedProductsNote(names: string[]): string {
  return names.length ? ` Hoy no tenemos ${enumerate(names)}.` : "";
}
