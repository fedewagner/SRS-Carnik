import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { confirmOrder } from "@/core/orders/confirm";
import { addLine, removeLine, updateLineQuantity } from "@/core/orders/editLines";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

// Server action invocada sin cookie de sesión, como haría un atacante con curl.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

async function draft(text: string) {
  const result = await ingestInboundMessage({ phoneE164: "+41790000030", text, channel: "SIMULATOR" });
  if (result.status !== "drafted") throw new Error(result.status);
  return db.order.findUniqueOrThrow({
    where: { id: result.order.id },
    include: { items: { include: { product: true }, orderBy: { createdAt: "asc" } } },
  });
}

const reload = (id: string) =>
  db.order.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });

describe("ajuste de líneas (US-08)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
  });

  it("ajustar una cantidad recalcula importe, total y aviso de disponibilidad", async () => {
    const order = await draft("6 kg de entrecot y 6 salchichas"); // hay 5 kg: aviso
    const entrecot = order.items.find((i) => i.product?.slug === "entrecot")!;
    expect(entrecot.hasStockWarning).toBe(true);

    expect(await updateLineQuantity(order.id, entrecot.id, "1.5")).toEqual({ ok: true });

    const after = await reload(order.id);
    expect(after.items.find((i) => i.id === entrecot.id)).toMatchObject({ lineTotalCents: 5850, hasStockWarning: false });
    expect(after.totalCents).toBe(5850 + 1140);
  });

  it.each([
    ["cero", "0"],
    ["negativa", "-1"],
    ["fraccionaria en piezas", "1.5"],
  ])("rechaza una cantidad %s sin tocar nada", async (_name, quantity) => {
    const order = await draft("6 salchichas");
    const result = await updateLineQuantity(order.id, order.items[0].id, quantity);
    expect(result).toEqual({ ok: false, code: "INVALID_QUANTITY" });
    expect((await reload(order.id)).totalCents).toBe(1140);
  });

  it("añadir y eliminar una línea recalcula el total", async () => {
    const order = await draft("6 salchichas");
    const cervelat = await db.product.findUniqueOrThrow({ where: { slug: "cervelat" } });

    expect(await addLine(order.id, cervelat.id, "2")).toEqual({ ok: true });
    let after = await reload(order.id);
    expect(after.items).toHaveLength(2);
    expect(after.totalCents).toBe(1140 + 500);

    expect(await removeLine(order.id, order.items[0].id)).toEqual({ ok: true });
    after = await reload(order.id);
    expect(after.items).toHaveLength(1);
    expect(after.totalCents).toBe(500);
  });

  it("un pedido confirmado no admite editar, añadir ni eliminar", async () => {
    const order = await draft("1 kg de entrecot");
    const employee = await createEmployee();
    await confirmOrder(order.id, employee.id);
    const cervelat = await db.product.findUniqueOrThrow({ where: { slug: "cervelat" } });
    const notDraft = { ok: false, code: "ORDER_NOT_DRAFT" };

    expect(await updateLineQuantity(order.id, order.items[0].id, "2")).toEqual(notDraft);
    expect(await addLine(order.id, cervelat.id, "1")).toEqual(notDraft);
    expect(await removeLine(order.id, order.items[0].id)).toEqual(notDraft);
    const after = await reload(order.id);
    expect(after.items).toHaveLength(1);
    expect(Number(after.items[0].quantity)).toBe(1);
    expect(Number((await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } })).stockQuantity)).toBe(4);
  });

  it("una edición confirmada antes que la confirmación es la que se descuenta", async () => {
    const order = await draft("2 kg de entrecot");
    const employee = await createEmployee();
    await updateLineQuantity(order.id, order.items[0].id, "1");
    await confirmOrder(order.id, employee.id);
    expect(Number((await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } })).stockQuantity)).toBe(4);
  });

  it("la server action sin sesión se rechaza sin modificar la línea", async () => {
    const { updateLineAction } = await import("@/app/(staff)/admin/orders/[id]/actions");
    const order = await draft("6 salchichas");
    const form = new FormData();
    form.set("orderId", order.id);
    form.set("itemId", order.items[0].id);
    form.set("quantity", "1");

    const state = await updateLineAction({}, form);
    expect(state.error).toMatch(/Sesión/);
    expect(Number((await reload(order.id)).items[0].quantity)).toBe(6);
  });
});
