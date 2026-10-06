import { db } from "@/lib/db";
import { sendOutboundMessage } from "./outbound";
import { rateLimitReply } from "./replies";

/** Máximo de mensajes que llegan al intérprete por conversación y ventana (R1). */
export const RATE_LIMIT_MAX_MESSAGES = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Cuenta los entrantes de la ventana, incluido el recién registrado, sin los que llegaron
 * con un borrador abierto: son aclaraciones, no intentos de pedido nuevo (R2, D14).
 */
export async function isOverMessageLimit(conversationId: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const orders = await db.order.findMany({
    where: { conversationId, OR: [{ status: "DRAFT" }, { confirmedAt: { gte: since } }] },
    select: { createdAt: true, confirmedAt: true },
  });
  // El mensaje que abre un pedido es anterior a su createdAt: queda fuera del intervalo y cuenta.
  const whileDraftOpen = orders.map((o) => ({ createdAt: { gt: o.createdAt, lte: o.confirmedAt ?? now } }));
  const count = await db.message.count({
    where: {
      conversationId,
      direction: "INBOUND",
      createdAt: { gte: since },
      ...(whileDraftOpen.length ? { NOT: { OR: whileDraftOpen } } : {}),
    },
  });
  return count > RATE_LIMIT_MAX_MESSAGES;
}

/**
 * Aplica el límite antes de invocar al intérprete. Devuelve null si el mensaje sigue su curso;
 * si no, el aviso enviado, o null en `reply` si ya se avisó en esta ventana (R4).
 */
export async function enforceMessageLimit(conversationId: string, now = new Date()): Promise<{ reply: string | null } | null> {
  if (!(await isOverMessageLimit(conversationId, now))) return null;
  // Sólo el id de la conversación: ni número ni contenido en los registros.
  console.warn("Límite de mensajes superado; no se invoca al intérprete:", conversationId);

  const body = rateLimitReply();
  const alreadyWarned = await db.message.count({
    where: {
      conversationId,
      direction: "OUTBOUND",
      body,
      createdAt: { gte: new Date(now.getTime() - RATE_LIMIT_WINDOW_MS) },
    },
  });
  if (alreadyWarned) return { reply: null };
  await sendOutboundMessage({ conversationId, body });
  return { reply: body };
}
