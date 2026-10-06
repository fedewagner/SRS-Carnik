import { beforeEach, describe, expect, it } from "vitest";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

async function draftFrom(text: string, phoneE164 = "+41790000001") {
  const result = await ingestInboundMessage({ phoneE164, text, channel: "SIMULATOR" });
  if (result.status !== "drafted") throw new Error(`se esperaba un borrador, llegó ${result.status}`);
  return result.order;
}

// El acuse de recepción también es saliente: el resumen se distingue por su texto.
const summaries = () =>
  db.message.findMany({ where: { direction: "OUTBOUND", body: { contains: "está confirmado" } } });

const stockOf = async (slug: string) =>
  Number((await db.product.findUniqueOrThrow({ where: { slug } })).stockQuantity);

describe("confirmOrder (US-10)", () => {
  let employeeId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    employeeId = (await createEmployee()).id;
  });

  it("C1 · confirma, descuenta existencias y registra el resumen saliente", async () => {
    const order = await draftFrom("2 kg de entrecot y 6 salchichas");
    expect(order.totalCents).toBe(7800 + 1140);

    const result = await confirmOrder(order.id, employeeId);

    expect(result.kind).toBe("confirmed");
    if (result.kind !== "confirmed") return;
    expect(result.alreadyConfirmed).toBe(false);
    expect(result.order.confirmedByUserId).toBe(employeeId);
    expect(await stockOf("entrecot")).toBe(3);
    expect(await stockOf("salchicha-lyoner")).toBe(34);

    const outbound = await summaries();
    expect(outbound).toHaveLength(1);
    expect(outbound[0].status).toBe("SENT");
    expect(outbound[0].body).toContain(order.reference);
    expect(outbound[0].body).toContain("CHF 89.40");
  });

  it("C2 · con existencias insuficientes no cambia nada y señala la línea", async () => {
    const order = await draftFrom("2 kg de entrecot y 6 salchichas");
    // Alguien vendió entrecot en el mostrador entretanto.
    await db.product.update({ where: { slug: "entrecot" }, data: { stockQuantity: "0.800" } });

    const result = await confirmOrder(order.id, employeeId);

    expect(result.kind).toBe("insufficient_stock");
    if (result.kind !== "insufficient_stock") return;
    expect(result.lines).toEqual([
      expect.objectContaining({ productName: "Entrecot", requested: "2.000", available: "0.800" }),
    ]);
    // Rollback completo: ni el estado ni la otra línea se tocaron.
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DRAFT");
    expect(await stockOf("salchicha-lyoner")).toBe(40);
    expect(await summaries()).toHaveLength(0);
  });

  it("C3 · dos confirmaciones concurrentes descuentan una sola vez", async () => {
    const order = await draftFrom("2 kg de entrecot");

    const results = await Promise.all([confirmOrder(order.id, employeeId), confirmOrder(order.id, employeeId)]);

    const confirmed = results.filter((r) => r.kind === "confirmed");
    expect(confirmed).toHaveLength(2);
    expect(confirmed.filter((r) => r.kind === "confirmed" && !r.alreadyConfirmed)).toHaveLength(1);
    expect(await stockOf("entrecot")).toBe(3);
    expect(await summaries()).toHaveLength(1);
  });

  it("no encuentra un pedido inexistente", async () => {
    expect(await confirmOrder("cnotexisting0000000000000", employeeId)).toEqual({ kind: "not_found" });
  });

  it("la base rechaza existencias negativas aunque la aplicación falle", async () => {
    await expect(
      db.$executeRawUnsafe(`UPDATE "Product" SET "stockQuantity" = -1 WHERE slug = 'entrecot'`),
    ).rejects.toThrow(/Product_stockQuantity_non_negative/);
  });
});

describe("ingestInboundMessage (US-02, US-05)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
  });

  it("valora con precios de la base y avisa de lo que supera el stock", async () => {
    const order = await draftFrom("6 kg de entrecot y 2 kg de cordero");
    const [entrecot, cordero] = order.items;
    expect(entrecot.unitPriceCents).toBe(3900);
    expect(entrecot.hasStockWarning).toBe(true);
    expect(cordero.productId).toBeNull();
    expect(cordero.lineTotalCents).toBe(0);
    expect(order.reference).toBe(order.id.slice(-6).toUpperCase());

    // Acuse registrado sin enviarse a la red: es una conversación del simulador.
    const [ack] = await db.message.findMany({ where: { direction: "OUTBOUND" } });
    expect(ack).toMatchObject({ channel: "SIMULATOR", status: "SENT", providerMessageId: null });
    // Enumera lo interpretado y lo pendiente, sin precios ni total.
    expect(ack.body).toContain("Anotamos: 6 kg Entrecot.");
    expect(ack.body).toContain("Revisamos a mano: «2 kg de cordero»");
    expect(ack.body).not.toMatch(/CHF/);
  });

  it("un segundo mensaje con borrador abierto se suma a la conversación", async () => {
    const first = await draftFrom("1 kg de entrecot");
    const second = await ingestInboundMessage({ phoneE164: "+41790000001", text: "y 2 cervelats", channel: "SIMULATOR" });
    expect(second).toMatchObject({ status: "appended", openOrderId: first.id });
    expect(await db.order.count()).toBe(1);
    // Quien añade algo a un borrador abierto no recibe un segundo acuse.
    expect(await db.message.count({ where: { direction: "OUTBOUND" } })).toBe(1);
  });

  it("es idempotente por providerMessageId", async () => {
    const msg = { phoneE164: "+41790000002", text: "1 kg de entrecot", channel: "WHATSAPP" as const, providerMessageId: "wamid.1" };
    await ingestInboundMessage(msg);
    expect(await ingestInboundMessage(msg)).toEqual({ status: "duplicate" });
    expect(await db.message.count({ where: { direction: "INBOUND" } })).toBe(1);
    expect(await db.message.count({ where: { direction: "OUTBOUND" } })).toBe(1); // un solo acuse
  });
});
