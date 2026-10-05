import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOutboundMessage } from "@/core/messaging/outbound";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { db } from "@/lib/db";
import { resetDatabase, seedCatalog } from "../helpers/db";

// Doble del SDK: ningún test sale a la red.
const sendTwilioWhatsApp = vi.fn();
vi.mock("@/lib/twilio/send", () => ({ sendTwilioWhatsApp: (...args: unknown[]) => sendTwilioWhatsApp(...args) }));

async function conversationFrom(channel: "WHATSAPP" | "SIMULATOR", phoneE164: string) {
  await ingestInboundMessage({
    phoneE164,
    text: "1 kg de entrecot",
    channel,
    providerMessageId: channel === "WHATSAPP" ? `SM${phoneE164.replace("+", "").padStart(32, "0")}` : null,
  });
  return db.conversation.findFirstOrThrow({ where: { customer: { phoneE164 } } });
}

describe("transporte saliente twilio", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    let n = 0;
    sendTwilioWhatsApp.mockReset().mockImplementation(async () => "SM" + String(++n).padStart(32, "f"));
    vi.stubEnv("WHATSAPP_TRANSPORT", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC" + "0".repeat(32));
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-auth-token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("TWILIO_WEBHOOK_URL", "https://carnik.test/api/webhooks/twilio");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("envía a una conversación de WhatsApp y guarda el SID del proveedor", async () => {
    const conversation = await conversationFrom("WHATSAPP", "+41790000020");
    const message = await sendOutboundMessage({ conversationId: conversation.id, body: "hola" });

    expect(sendTwilioWhatsApp).toHaveBeenCalledWith(expect.anything(), "+41790000020", "hola");
    expect(message).toMatchObject({ status: "SENT", channel: "WHATSAPP" });
    expect(message.providerMessageId).toMatch(/^SM/);
  });

  it("si Twilio falla, registra FAILED sin lanzar", async () => {
    const conversation = await conversationFrom("WHATSAPP", "+41790000021");
    sendTwilioWhatsApp.mockRejectedValueOnce(Object.assign(new Error("fuera de ventana"), { code: 63016 }));

    const message = await sendOutboundMessage({ conversationId: conversation.id, body: "hola" });
    expect(message.status).toBe("FAILED");
  });

  it("nunca envía a la red una conversación del simulador", async () => {
    sendTwilioWhatsApp.mockClear();
    const conversation = await conversationFrom("SIMULATOR", "+41790000022");
    await sendOutboundMessage({ conversationId: conversation.id, body: "hola" });

    expect(sendTwilioWhatsApp).not.toHaveBeenCalled();
    const outbound = await db.message.findMany({ where: { conversationId: conversation.id, direction: "OUTBOUND" } });
    expect(outbound.every((m) => m.channel === "SIMULATOR" && m.status === "SENT")).toBe(true);
  });
});
