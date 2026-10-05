import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Drafting from "@/core/drafting";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { RATE_LIMIT_MAX_MESSAGES, RATE_LIMIT_WINDOW_MS } from "@/core/messaging/rateLimit";
import { rateLimitReply } from "@/core/messaging/replies";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

// Espía sobre el drafter real: cada llamada equivale a una invocación al proveedor de AI.
const draftSpy = vi.hoisted(() => vi.fn());
vi.mock("@/core/drafting", async (importOriginal) => {
  const actual = await importOriginal<typeof Drafting>();
  return {
    ...actual,
    getOrderDrafter: () => {
      const real = actual.getOrderDrafter();
      return { draft: (...args: Parameters<typeof real.draft>) => (draftSpy(...args), real.draft(...args)) };
    },
  };
});

const PHONE = "+41790000077";
const send = (text: string) => ingestInboundMessage({ phoneE164: PHONE, text, channel: "SIMULATOR" });
const warnings = () => db.message.count({ where: { direction: "OUTBOUND", body: rateLimitReply() } });

/** Llena la ventana con consultas: llegan al intérprete pero no abren borrador. */
async function fillWindow() {
  for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) await send("¿abren el sábado?");
}

describe("límite de consumo por cliente (US-03)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    draftSpy.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("dentro del límite procesa con normalidad", async () => {
    await fillWindow();
    expect(draftSpy).toHaveBeenCalledTimes(RATE_LIMIT_MAX_MESSAGES);
    expect(await warnings()).toBe(0);
  });

  it("por encima del límite registra el mensaje sin invocar al drafter ni crear pedido", async () => {
    await fillWindow();
    draftSpy.mockClear();

    const result = await send("2 kg de entrecot");
    expect(result).toMatchObject({ status: "rate_limited", reply: rateLimitReply() });
    expect(draftSpy).not.toHaveBeenCalled();
    expect(await db.order.count()).toBe(0);
    // El empleado ve la conversación completa, incluido el mensaje limitado.
    const inbound = await db.message.findMany({ where: { direction: "INBOUND" } });
    expect(inbound).toHaveLength(RATE_LIMIT_MAX_MESSAGES + 1);
    expect(inbound.some((m) => m.body === "2 kg de entrecot")).toBe(true);
  });

  it("el aviso se envía una sola vez por ventana", async () => {
    await fillWindow();
    await send("hola?");
    const again = await send("hola??");
    expect(again).toMatchObject({ status: "rate_limited", reply: null });
    await send("hola???");
    expect(await warnings()).toBe(1);
  });

  it("transcurrida la ventana vuelve a procesar", async () => {
    await fillWindow();
    await send("hola?");
    const past = new Date(Date.now() - RATE_LIMIT_WINDOW_MS - 1000);
    await db.message.updateMany({ data: { createdAt: past } });
    draftSpy.mockClear();

    expect((await send("2 kg de entrecot")).status).toBe("drafted");
    expect(draftSpy).toHaveBeenCalledTimes(1);
  });

  it("las aclaraciones sobre un borrador abierto no cuentan como intentos de pedido nuevo", async () => {
    const first = await send("2 kg de entrecot");
    if (first.status !== "drafted") throw new Error(first.status);
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES + 5; i++) {
      expect((await send(`aclaración ${i}`)).status).toBe("appended");
    }
    expect(await db.order.count()).toBe(1);
    await confirmOrder(first.order.id, (await createEmployee()).id);
    draftSpy.mockClear();

    // Tras confirmar, un pedido nuevo llega al intérprete: sólo cuenta el mensaje que abrió el anterior.
    expect((await send("6 salchichas")).status).toBe("drafted");
    expect(draftSpy).toHaveBeenCalledTimes(1);
    expect(await warnings()).toBe(0);
  });
});
