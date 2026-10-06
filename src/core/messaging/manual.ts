import { db } from "@/lib/db";
import { sendOutboundMessage } from "./outbound";

export type ManualMessageResult =
  | { ok: true; status: "SENT" | "FAILED" }
  | { ok: false; code: "NOT_FOUND" };

/**
 * Mensaje escrito por una persona desde el detalle de un pedido (US-12). Sale por el canal
 * de la conversación y queda atribuido a quien lo escribió. Vale en borrador y en confirmado,
 * y no toca el pedido: sólo inserta el Message, sin el bloqueo de fila de las ediciones.
 * El texto llega ya validado (ManualMessageSchema); aquí no se recorta ni se reescribe.
 */
export async function sendManualMessage(orderId: string, userId: string, body: string): Promise<ManualMessageResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { conversationId: true } });
  if (!order) return { ok: false, code: "NOT_FOUND" };

  const message = await sendOutboundMessage({ conversationId: order.conversationId, body, sentByUserId: userId });
  return { ok: true, status: message.status === "FAILED" ? "FAILED" : "SENT" };
}
