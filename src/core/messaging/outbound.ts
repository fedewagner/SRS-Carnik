import { db } from "@/lib/db";

/**
 * Transporte saliente. En esta entrega sólo existe el modo `log`: el mensaje se registra
 * en la conversación como enviado sin llamar a ningún proveedor (D12, WHATSAPP_TRANSPORT).
 */
export async function sendOutboundMessage(input: {
  conversationId: string;
  body: string;
  sentByUserId?: string | null;
}) {
  const transport = process.env.WHATSAPP_TRANSPORT ?? "log";
  let status: "SENT" | "FAILED" = "SENT";
  if (transport !== "log") {
    console.error(`WHATSAPP_TRANSPORT=${transport} no está implementado en esta entrega`);
    status = "FAILED";
  }
  return db.message.create({
    data: {
      conversationId: input.conversationId,
      sentByUserId: input.sentByUserId ?? null,
      direction: "OUTBOUND",
      channel: "WHATSAPP",
      body: input.body,
      status,
    },
  });
}
