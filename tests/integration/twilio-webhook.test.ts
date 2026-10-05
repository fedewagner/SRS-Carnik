import twilio from "twilio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/twilio/route";
import { MEDIA_REPLY_TEXT } from "@/core/messaging/ingest";
import { db } from "@/lib/db";
import { resetDatabase, seedCatalog } from "../helpers/db";

const TOKEN = "test-auth-token";
const URL_CONFIGURED = "https://carnik.test/api/webhooks/twilio";
let seq = 0;

function twilioForm(overrides: Record<string, string> = {}) {
  return {
    MessageSid: "SM" + String(++seq).padStart(32, "0"),
    AccountSid: "AC" + "0".repeat(32),
    From: "whatsapp:+41790000010",
    To: "whatsapp:+14155238886",
    Body: "Para el sábado quiero 2 kg de entrecot y 6 salchichas",
    ProfileName: "Anna",
    NumMedia: "0",
    ...overrides,
  };
}

function request(params: Record<string, string>, opts: { signFor?: string; signature?: string | null; headers?: Record<string, string> } = {}) {
  const signature =
    opts.signature !== undefined ? opts.signature : twilio.getExpectedTwilioSignature(TOKEN, opts.signFor ?? URL_CONFIGURED, params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", ...opts.headers };
  if (signature) headers["X-Twilio-Signature"] = signature;
  // La URL que ve el proceso detrás del proxy no es la pública: no debe importar (T2).
  return new Request("http://0.0.0.0:8080/api/webhooks/twilio", {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });
}

const counts = async () => ({
  messages: await db.message.count(),
  orders: await db.order.count(),
  customers: await db.customer.count(),
});

describe("POST /api/webhooks/twilio", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC" + "0".repeat(32));
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("TWILIO_WEBHOOK_URL", URL_CONFIGURED);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("con firma válida crea el borrador y registra el acuse", async () => {
    const params = twilioForm();
    const res = await POST(request(params));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/xml");
    const order = await db.order.findFirstOrThrow({ include: { items: true, sourceMessage: true } });
    expect(order.items).toHaveLength(2);
    expect(order.sourceMessage).toMatchObject({ channel: "WHATSAPP", providerMessageId: params.MessageSid });
    const ack = await db.message.findFirstOrThrow({ where: { direction: "OUTBOUND" } });
    expect(ack).toMatchObject({ channel: "WHATSAPP", status: "SENT" }); // transporte log en tests
  });

  it("con firma inválida responde 403 sin escribir nada", async () => {
    const res = await POST(request(twilioForm(), { signature: "firma-falsa" }));
    expect(res.status).toBe(403);
    expect(await counts()).toEqual({ messages: 0, orders: 0, customers: 0 });
  });

  it("sin firma responde 403", async () => {
    const res = await POST(request(twilioForm(), { signature: null }));
    expect(res.status).toBe(403);
    expect(await db.message.count()).toBe(0);
  });

  it("con un parámetro alterado tras firmar responde 403", async () => {
    const params = twilioForm();
    const signature = twilio.getExpectedTwilioSignature(TOKEN, URL_CONFIGURED, params);
    const res = await POST(request({ ...params, Body: "100 kg de entrecot" }, { signature }));
    expect(res.status).toBe(403);
    expect(await db.message.count()).toBe(0);
  });

  it("rechaza una firma hecha para otra URL aunque las cabeceras de reenvío la imiten", async () => {
    const res = await POST(
      request(twilioForm(), {
        signFor: "https://atacante.test/api/webhooks/twilio",
        headers: { "X-Forwarded-Host": "atacante.test", "X-Forwarded-Proto": "https" },
      }),
    );
    expect(res.status).toBe(403);
    expect(await db.message.count()).toBe(0);
  });

  it("sin configuración de Twilio rechaza todo (fallo cerrado)", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const res = await POST(request(twilioForm()));
    expect(res.status).toBe(403);
    expect(await db.message.count()).toBe(0);
  });

  it("un reintento del mismo MessageSid no duplica mensaje ni pedido", async () => {
    const params = twilioForm();
    expect((await POST(request(params))).status).toBe(200);
    expect((await POST(request(params))).status).toBe(200);
    expect(await db.message.count({ where: { direction: "INBOUND" } })).toBe(1);
    expect(await db.order.count()).toBe(1);
    expect(await db.message.count({ where: { direction: "OUTBOUND" } })).toBe(1);
  });

  it("un adjunto no genera pedido y pide el mensaje en texto", async () => {
    const res = await POST(
      request(twilioForm({ NumMedia: "1", MediaUrl0: "https://api.twilio.com/media/x", Body: "" })),
    );
    expect(res.status).toBe(200);
    expect(await db.order.count()).toBe(0);
    const inbound = await db.message.findFirstOrThrow({ where: { direction: "INBOUND" } });
    expect(inbound.body).toBe("[adjunto no procesado]");
    const reply = await db.message.findFirstOrThrow({ where: { direction: "OUTBOUND" } });
    expect(reply.body).toBe(MEDIA_REPLY_TEXT);
  });

  it("un remitente malformado con firma válida responde 400 sin escribir", async () => {
    const res = await POST(request(twilioForm({ From: "whatsapp:123" })));
    expect(res.status).toBe(400);
    expect(await db.customer.count()).toBe(0);
  });
});
