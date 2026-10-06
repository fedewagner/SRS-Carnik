import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@/lib/auth/session";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

// Sesión controlada por cada test: vacía equivale a una petición sin cookie (p. ej. con curl).
let session: SessionData = {};
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// Doble del SDK de Twilio: ningún test sale a la red.
const sendTwilioWhatsApp = vi.fn();
vi.mock("@/lib/twilio/send", () => ({ sendTwilioWhatsApp: (...args: unknown[]) => sendTwilioWhatsApp(...args) }));

const { sendManualMessageAction } = await import("@/app/(staff)/admin/orders/[id]/actions");

const PHONE = "+41790000040";

async function draft(channel: "SIMULATOR" | "WHATSAPP" = "SIMULATOR", text = "6 kg de entrecot") {
  const result = await ingestInboundMessage({
    phoneE164: PHONE,
    text,
    channel,
    providerMessageId: channel === "WHATSAPP" ? "SM" + "1".repeat(32) : null,
  });
  if (result.status !== "drafted") throw new Error(result.status);
  return result.order;
}

function signIn(user: { id: string; role: "EMPLOYEE" | "ADMIN" }) {
  session = { userId: user.id, role: user.role, expiresAt: Date.now() + 60_000 };
}

function send(orderId: string, body: string) {
  const form = new FormData();
  form.set("orderId", orderId);
  form.set("body", body);
  return sendManualMessageAction({}, form);
}

const manualMessages = () => db.message.findMany({ where: { sentByUserId: { not: null } } });

describe("mensaje manual al cliente (US-12)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    session = {};
    let n = 0;
    sendTwilioWhatsApp.mockReset().mockImplementation(async () => "SM" + String(++n).padStart(32, "f"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("el empleado pide una aclaración: se envía atribuido y la respuesta se suma sin otro borrador", async () => {
    const order = await draft();
    const employee = await createEmployee();
    signIn(employee);

    expect(await send(order.id, "  del entrecot me quedan 1,5 kg, ¿te sirve?  ")).toEqual({ sent: true });

    const [message] = await manualMessages();
    expect(message).toMatchObject({
      conversationId: order.conversationId,
      sentByUserId: employee.id,
      direction: "OUTBOUND",
      channel: "SIMULATOR",
      status: "SENT",
      body: "del entrecot me quedan 1,5 kg, ¿te sirve?",
    });

    const reply = await ingestInboundMessage({ phoneE164: PHONE, text: "sí, 1,5 kg está bien", channel: "SIMULATOR" });
    expect(reply).toMatchObject({ status: "appended", openOrderId: order.id });
    expect(await db.order.count()).toBe(1);
    const bodies = (await db.message.findMany({ where: { conversationId: order.conversationId }, orderBy: { createdAt: "asc" } }))
      .map((m) => m.body);
    expect(bodies.slice(-2)).toEqual(["del entrecot me quedan 1,5 kg, ¿te sirve?", "sí, 1,5 kg está bien"]);
  });

  it("un ADMIN también puede escribir y queda como autor", async () => {
    const order = await draft();
    const admin = await db.user.create({ data: { email: "admin@carnik.test", role: "ADMIN", passwordHash: "x" } });
    signIn(admin);

    expect(await send(order.id, "hola")).toEqual({ sent: true });
    expect((await manualMessages())[0].sentByUserId).toBe(admin.id);
  });

  it("sale por WhatsApp cuando la conversación vino por WhatsApp", async () => {
    vi.stubEnv("WHATSAPP_TRANSPORT", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC" + "0".repeat(32));
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-auth-token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("TWILIO_WEBHOOK_URL", "https://carnik.test/api/webhooks/twilio");
    const order = await draft("WHATSAPP");
    sendTwilioWhatsApp.mockClear();
    signIn(await createEmployee());

    expect(await send(order.id, "¿lo pasás a buscar el sábado?")).toEqual({ sent: true });
    expect(sendTwilioWhatsApp).toHaveBeenCalledWith(expect.anything(), PHONE, "¿lo pasás a buscar el sábado?");
    expect((await manualMessages())[0]).toMatchObject({ channel: "WHATSAPP", status: "SENT" });
  });

  it("sobre un pedido confirmado se envía sin cambiar estado, total ni existencias", async () => {
    const order = await draft("SIMULATOR", "1 kg de entrecot");
    const employee = await createEmployee();
    await confirmOrder(order.id, employee.id);
    const before = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    const stockBefore = (await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } })).stockQuantity.toString();
    signIn(employee);

    expect(await send(order.id, "¡Gracias! Te esperamos el sábado.")).toEqual({ sent: true });

    expect(await manualMessages()).toHaveLength(1);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "CONFIRMED", totalCents: before.totalCents, updatedAt: before.updatedAt });
    expect((await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } })).stockQuantity.toString()).toBe(stockBefore);
  });

  it.each([
    ["vacío", "", /Escribí un mensaje/],
    ["de sólo espacios", "   \n  ", /Escribí un mensaje/],
    ["desmesurado", "a".repeat(1601), /1600 caracteres/],
  ])("rechaza en el servidor un mensaje %s sin registrar nada", async (_name, body, reason) => {
    const order = await draft();
    signIn(await createEmployee());
    const outboundBefore = await db.message.count({ where: { direction: "OUTBOUND" } });

    const result = await send(order.id, body);
    expect(result.error).toMatch(reason);
    expect(result.sent).toBeUndefined();
    expect(await db.message.count({ where: { direction: "OUTBOUND" } })).toBe(outboundBefore);
  });

  it("si el canal falla, queda registrado como no entregado y el pedido sigue igual", async () => {
    vi.stubEnv("WHATSAPP_TRANSPORT", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC" + "0".repeat(32));
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-auth-token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("TWILIO_WEBHOOK_URL", "https://carnik.test/api/webhooks/twilio");
    const order = await draft("WHATSAPP");
    signIn(await createEmployee());
    sendTwilioWhatsApp.mockRejectedValueOnce(Object.assign(new Error("fuera de ventana"), { code: 63016 }));

    const result = await send(order.id, "¿te sirve 1,5 kg?");
    expect(result.error).toMatch(/no entregado/);
    expect((await manualMessages())[0]).toMatchObject({ status: "FAILED", body: "¿te sirve 1,5 kg?" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "DRAFT" });
  });

  it("un pedido inexistente se rechaza sin registrar nada", async () => {
    await draft();
    signIn(await createEmployee());

    expect((await send("c" + "z".repeat(24), "hola")).error).toMatch(/ya no existe/);
    expect(await manualMessages()).toHaveLength(0);
  });

  it("sin sesión la server action se rechaza sin enviar ni registrar nada", async () => {
    const order = await draft();
    const messagesBefore = await db.message.count();
    sendTwilioWhatsApp.mockClear();

    expect(await send(order.id, "hola")).toEqual({ error: "Sesión caducada. Volvé a entrar." });
    // El rol se comprueba antes que la validación: sin sesión no se filtra ni el motivo.
    expect(await send("../x", "")).toEqual({ error: "Sesión caducada. Volvé a entrar." });
    expect(await db.message.count()).toBe(messagesBefore);
    expect(sendTwilioWhatsApp).not.toHaveBeenCalled();
  });

  it("con la sesión caducada también se rechaza", async () => {
    const order = await draft();
    const employee = await createEmployee();
    session = { userId: employee.id, role: "EMPLOYEE", expiresAt: Date.now() - 1 };

    expect((await send(order.id, "hola")).error).toMatch(/Sesión caducada/);
    expect(await manualMessages()).toHaveLength(0);
  });
});
