import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getOrderDrafter } from "@/core/drafting";
import { isShortAffirmative } from "@/core/drafting/intent";
import type { Intent } from "@/core/drafting/schema";
import type { DraftResult } from "@/core/drafting/types";
import { createDraftOrder } from "@/core/orders/createDraft";
import { findLastConfirmedOrder, repeatLines } from "@/core/orders/repeat";
import { catalogAnswerFor } from "./catalog-answer";
import { sendOutboundMessage } from "./outbound";
import { enforceMessageLimit } from "./rateLimit";
import {
  REPEAT_OFFER_PREFIX,
  ackReply,
  greetingReply,
  noHistoryReply,
  questionReply,
  skippedProductsNote,
} from "./replies";
import type { InboundMessage } from "./types";

export const MEDIA_REPLY_TEXT = "Por ahora sólo podemos leer mensajes de texto. ¿Nos escribís tu pedido? Por ejemplo: «2 kg de entrecot y 6 salchichas».";

export type IngestResult =
  | { status: "duplicate" }
  | { status: "appended"; messageId: string; openOrderId: string }
  | { status: "drafted"; messageId: string; order: Awaited<ReturnType<typeof createDraftOrder>> }
  | { status: "replied"; messageId: string; intent: Exclude<Intent, "ORDER">; reply: string }
  | { status: "unsupported"; messageId: string }
  | { status: "rate_limited"; messageId: string; reply: string | null };

/**
 * Punto único de entrada para todo mensaje entrante, venga del simulador o de un proveedor (D6).
 * Mientras el cliente tiene un borrador abierto, sus mensajes se suman a la conversación
 * en vez de abrir un segundo pedido (supuesto 4 del proposal). Si no, se decide por intención:
 * sólo un pedido o una repetición crean borrador; saludo y consulta reciben una respuesta.
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

  // Límite por remitente antes de invocar al intérprete (US-03); el mensaje ya quedó registrado.
  const limited = await enforceMessageLimit(conversation.id);
  if (limited) return { status: "rate_limited", messageId: message.id, reply: limited.reply };

  const catalog = await db.product.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, unit: true },
  });
  const draft = await getOrderDrafter().draft(msg.text, catalog);
  const intent = await effectiveIntent(draft, msg.text, conversation.id);
  const source = { customerId: customer.id, conversationId: conversation.id, sourceMessageId: message.id };
  const reply = (body: string, kind: Exclude<Intent, "ORDER">) =>
    sendOutboundMessage({ conversationId: conversation.id, body }).then(
      () => ({ status: "replied", messageId: message.id, intent: kind, reply: body }) as const,
    );

  if (intent === "ORDER") {
    const order = await createDraftOrder(source, draft);
    // Acuse sólo al abrir un borrador: quien añade algo a uno abierto no recibe otro (T6).
    await sendOutboundMessage({ conversationId: conversation.id, body: ackFor(order) });
    return { status: "drafted", messageId: message.id, order };
  }

  if (intent === "REPEAT_LAST") {
    const last = await findLastConfirmedOrder(customer.id);
    if (!last?.lines.length) return reply(noHistoryReply(), "REPEAT_LAST");
    const order = await createDraftOrder(source, { ...draft, lines: repeatLines(last) });
    await sendOutboundMessage({
      conversationId: conversation.id,
      body: ackFor(order) + skippedProductsNote(last.inactive),
    });
    return { status: "drafted", messageId: message.id, order };
  }

  if (intent === "GREETING") {
    const last = await findLastConfirmedOrder(customer.id);
    return reply(greetingReply(customer.profileName, last?.lines ?? null), "GREETING");
  }
  // Consulta de precio o disponibilidad de productos del catálogo; si no, una persona (A5).
  return reply((await catalogAnswerFor(draft.askedProducts)) ?? questionReply(), "QUESTION");
}

/**
 * Ante la duda, pedido: si hay líneas, es un pedido (C2). Una afirmación suelta sólo repite
 * si la última respuesta enviada fue la sugerencia (C4); si no, queda para una persona.
 */
async function effectiveIntent(draft: DraftResult, text: string, conversationId: string): Promise<Intent> {
  if (draft.lines.length > 0) return "ORDER";
  if (!isShortAffirmative(text)) return draft.intent;
  const lastOutbound = await db.message.findFirst({
    where: { conversationId, direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  return lastOutbound?.body.includes(REPEAT_OFFER_PREFIX) ? "REPEAT_LAST" : "QUESTION";
}

function ackFor(order: Awaited<ReturnType<typeof createDraftOrder>>): string {
  const lines = order.items.flatMap((i) =>
    i.product ? [{ quantity: Number(i.quantity), unit: i.product.unit, productName: i.product.name }] : [],
  );
  const unresolved = order.items.filter((i) => !i.product).map((i) => i.rawText);
  return ackReply(lines, unresolved);
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
