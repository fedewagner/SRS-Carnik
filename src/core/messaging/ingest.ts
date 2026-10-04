import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getOrderDrafter } from "@/core/drafting";
import { createDraftOrder } from "@/core/orders/createDraft";
import type { InboundMessage } from "./types";

export type IngestResult =
  | { status: "duplicate" }
  | { status: "appended"; messageId: string; openOrderId: string }
  | { status: "drafted"; messageId: string; order: Awaited<ReturnType<typeof createDraftOrder>> };

/**
 * Punto único de entrada para todo mensaje entrante, venga del simulador o de un proveedor (D6).
 * Mientras el cliente tiene un borrador abierto, sus mensajes se suman a la conversación
 * en vez de abrir un segundo pedido (supuesto 4 del proposal).
 */
export async function ingestInboundMessage(msg: InboundMessage): Promise<IngestResult> {
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
      return { status: "duplicate" };
    }
    throw error;
  }

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
  return { status: "drafted", messageId: message.id, order };
}
