import { db } from "@/lib/db";
import { getTwilioConfig } from "@/lib/twilio/config";
import { sendTwilioWhatsApp } from "@/lib/twilio/send";

/** Límite de un mensaje de WhatsApp vía Twilio. */
const MAX_BODY = 1600;

/**
 * Transporte saliente según WHATSAPP_TRANSPORT (D12, T6):
 * - `twilio`: envía de verdad, pero sólo a conversaciones cuyo último mensaje entrante llegó
 *   por WhatsApp; las del simulador nunca salen a la red.
 * - `log` (por defecto, y siempre en tests y CI): registra el mensaje sin enviarlo.
 * Un fallo de envío queda como FAILED y nunca se propaga: el pedido no depende del aviso.
 */
export async function sendOutboundMessage(input: {
  conversationId: string;
  body: string;
  sentByUserId?: string | null;
}) {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: input.conversationId },
    include: {
      customer: { select: { phoneE164: true } },
      messages: { where: { direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 1, select: { channel: true } },
    },
  });
  const channel = conversation.messages[0]?.channel ?? "SIMULATOR";
  const body = input.body.slice(0, MAX_BODY);

  let status: "SENT" | "FAILED" = "SENT";
  let providerMessageId: string | null = null;

  if (process.env.WHATSAPP_TRANSPORT === "twilio" && channel === "WHATSAPP") {
    const config = getTwilioConfig();
    if (!config) {
      console.error("WHATSAPP_TRANSPORT=twilio sin configuración de Twilio completa");
      status = "FAILED";
    } else {
      try {
        providerMessageId = await sendTwilioWhatsApp(config, conversation.customer.phoneE164, body);
      } catch (error) {
        // Sin número ni cuerpo en el log: sólo el código del proveedor.
        console.error("Envío por Twilio fallido:", (error as { code?: number }).code ?? "sin código");
        status = "FAILED";
      }
    }
  }

  return db.message.create({
    data: {
      conversationId: input.conversationId,
      sentByUserId: input.sentByUserId ?? null,
      providerMessageId,
      direction: "OUTBOUND",
      channel,
      body,
      status,
    },
  });
}
