import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getOrderDrafter } from "@/core/drafting";
import { createDraftOrder } from "@/core/orders/createDraft";
import { sendOutboundMessage } from "./outbound";
import type { InboundMessage } from "./types";

/** Confirma sólo la recepción: ni precios, ni disponibilidad, ni plazos (spec, acuse). */
export const ACK_TEXT = "¡Gracias! Recibimos tu pedido. Lo revisamos y te confirmamos el detalle en breve.";
export const MEDIA_REPLY_TEXT = "Por ahora sólo podemos leer mensajes de texto. ¿Nos escribís tu pedido? Por ejemplo: «2 kg de entrecot y 6 salchichas».";

export type IngestResult =
  | { status: "duplicate" }
  | { status: "appended"; messageId: string; openOrderId: string }
  | { status: "drafted"; messageId: string; order: Awaited<ReturnType<typeof createDraftOrder>> }
  | { status: "unsupported"; messageId: string };

/**
 * Punto único de entrada para todo mensaje entrante, venga del simulador o de un proveedor (D6).
 * Mientras el cliente tiene un borrador abierto, sus mensajes se suman a la conversación
 * en vez de abrir un segundo pedido (supuesto 4 del proposal).
 */
export async function ingestInboundMessage(msg: InboundMessage): Promise<IngestResult> {
  const stored = await storeInbound(msg);
  if (!stored) return { status: "duplicate" };
  const { customer, conversation, message } = stored;

  const openOrder = await db.order.findFirst({
    where: { conversationId: conversation.id, status: "DRAFT" },
    select: { id: true },
  });
  if (openOrder) return { status: "appended", messageId: message.id, openOrderId: openOrder.id };

  const catalog = await db.product.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, unit: true },
  });
  const draft = await getOrderDrafter().draft(msg.text, catalog);
  const order = await createDraftOrder(
    { customerId: customer.id, conversationId: conversation.id, sourceMessageId: message.id },
    draft,
  );
  // Acuse sólo al abrir un borrador: quien añade algo a uno abierto no recibe otro (T6).
  await sendOutboundMessage({ conversationId: conversation.id, body: ACK_TEXT });
  return { status: "drafted", messageId: message.id, order };
}

/**
 * Mensaje con adjunto: queda constancia sin su contenido, no genera pedido,
 * y se pide al cliente que escriba en texto (T7).
 */
export async function ingestUnsupportedMessage(msg: InboundMessage): Promise<IngestResult> {
  const stored = await storeInbound(msg);
  if (!stored) return { status: "duplicate" };
  await sendOutboundMessage({ conversationId: stored.conversation.id, body: MEDIA_REPLY_TEXT });
  return { status: "unsupported", messageId: stored.message.id };
}

async function storeInbound(msg: InboundMessage) {
  const customer = await db.customer.upsert({
    where: { phoneE164: msg.phoneE164 },
    create: { phoneE164: msg.phoneE164, profileName: msg.profileName ?? null },
    update: msg.profileName ? { profileName: msg.profileName } : {},
  });
  const conversation = await db.conversation.upsert({
    where: { customerId: customer.id },
    create: { customerId: customer.id, lastInboundAt: new Date() },
    update: { lastInboundAt: new Date() },
  });

  let message;
  try {
    message = await db.message.create({
      data: {
        conversationId: conversation.id,
        providerMessageId: msg.providerMessageId ?? null,
        direction: "INBOUND",
        channel: msg.channel,
        body: msg.text,
      },
    });
  } catch (error) {
    // Idempotencia por índice único de providerMessageId: un reintento del proveedor no duplica.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
  return { customer, conversation, message };
}
