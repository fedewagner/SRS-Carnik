import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@/lib/auth/session";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { startOfZurichDay } from "@/core/orders/assemblyQueue";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

// La sesión se sustituye por una variable: vacía equivale a una petición sin cookie.
let session: SessionData = {};
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));

const { GET } = await import("@/app/api/orders/assembly-queue/route");
const { default: DashboardPage } = await import("@/app/(staff)/dashboard/page");

const PHONE = "+41790000013";

async function confirmedFrom(text: string, employeeId: string, phoneE164 = PHONE, profileName?: string) {
  const result = await ingestInboundMessage({ phoneE164, text, channel: "SIMULATOR", profileName });
  if (result.status !== "drafted") throw new Error(`se esperaba un borrador, llegó ${result.status}`);
  const confirmed = await confirmOrder(result.order.id, employeeId);
  if (confirmed.kind !== "confirmed") throw new Error(confirmed.kind);
  return result.order;
}

async function queue() {
  const res = await GET();
  expect(res.status).toBe(200);
  return { raw: await res.clone().text(), body: await res.json() };
}

describe("cola de armado (US-13)", () => {
  let employeeId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    employeeId = (await createEmployee()).id;
    session = { userId: employeeId, role: "EMPLOYEE", expiresAt: Date.now() + 60_000 };
  });

  it("un pedido confirmado aparece con líneas, cantidades, hora y nombre de pila", async () => {
    const order = await confirmedFrom("2 kg de entrecot y 6 salchichas", employeeId, PHONE, "Ana María Pérez");
    const { confirmedAt } = await db.order.findUniqueOrThrow({ where: { id: order.id } });

    const { body } = await queue();

    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      reference: order.reference,
      customerName: "Ana",
      confirmedAt: confirmedAt!.toISOString(),
      confirmedTime: confirmedAt!.toLocaleTimeString("es-CH", {
        timeZone: "Europe/Zurich",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    expect(body.orders[0].lines.map((l: { quantityLabel: string; productName: string }) => [l.quantityLabel, l.productName]))
      .toEqual([
        ["2 kg", "Entrecot"],
        ["6 u.", "Salchicha Lyoner"],
      ]);
  });

  it("no expone teléfono, conversación ni texto del cliente", async () => {
    await confirmedFrom("2 kg de entrecot y 6 salchichas", employeeId);

    const { raw, body } = await queue();

    expect(raw).not.toContain(PHONE);
    expect(raw).not.toContain("79000");
    expect(raw).not.toContain("2 kg de entrecot y 6 salchichas");
    expect(Object.keys(body.orders[0]).sort()).toEqual(
      ["confirmedAt", "confirmedTime", "customerName", "id", "lines", "reference"].sort(),
    );
    expect(Object.keys(body.orders[0].lines[0]).sort()).toEqual(["id", "productName", "quantityLabel"]);
  });

  it("sin nombre de perfil muestra «Cliente»", async () => {
    await confirmedFrom("3 cervelat", employeeId);
    const { body } = await queue();
    expect(body.orders[0].customerName).toBe("Cliente");
  });

  it("excluye borradores y confirmados de días anteriores, y ordena del más antiguo al más reciente", async () => {
    const yesterday = await confirmedFrom("1 kg de entrecot", employeeId, "+41790000101");
    const first = await confirmedFrom("2 cervelat", employeeId, "+41790000102");
    const second = await confirmedFrom("4 salchichas", employeeId, "+41790000103");
    await ingestInboundMessage({ phoneE164: "+41790000104", text: "1 kg de entrecot", channel: "SIMULATOR" });

    // Alrededor de la medianoche de Zurich: un segundo antes es ayer, uno después ya es hoy.
    const midnight = startOfZurichDay(new Date()).getTime();
    await db.order.update({ where: { id: yesterday.id }, data: { confirmedAt: new Date(midnight - 1000) } });
    await db.order.update({ where: { id: second.id }, data: { confirmedAt: new Date(midnight + 2000) } });
    await db.order.update({ where: { id: first.id }, data: { confirmedAt: new Date(midnight + 1000) } });

    const { body } = await queue();

    expect(body.orders.map((o: { reference: string }) => o.reference)).toEqual([first.reference, second.reference]);
  });

  it("omite las menciones sin producto, que no se confirmaron contra existencias", async () => {
    const order = await confirmedFrom("2 cervelat", employeeId);
    // Mención que nadie resolvió antes de confirmar: queda en el pedido sin producto.
    await db.orderItem.create({
      data: { orderId: order.id, rawText: "un poco de magia", quantity: "1", unitPriceCents: 0, lineTotalCents: 0 },
    });

    const { body } = await queue();

    expect(body.orders[0].lines).toEqual([expect.objectContaining({ productName: "Cervelat", quantityLabel: "2 u." })]);
    expect(JSON.stringify(body)).not.toContain("magia");
  });

  it("sin pedidos confirmados devuelve una cola vacía y válida", async () => {
    await ingestInboundMessage({ phoneE164: PHONE, text: "1 kg de entrecot", channel: "SIMULATOR" });
    const { body } = await queue();
    expect(body.orders).toEqual([]);
    expect(typeof body.generatedAt).toBe("string");
  });

  it("sin sesión el endpoint responde 401 sin consultar la base", async () => {
    session = {};
    const spy = vi.spyOn(db.order, "findMany");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("con la sesión vencida el endpoint responde 401", async () => {
    session = { userId: employeeId, role: "EMPLOYEE", expiresAt: Date.now() - 1 };
    expect((await GET()).status).toBe(401);
  });

  it("sin sesión la página redirige al login sin consultar la base", async () => {
    session = {};
    const spy = vi.spyOn(db.order, "findMany");
    await expect(DashboardPage()).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
