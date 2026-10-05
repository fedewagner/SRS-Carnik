import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";
import { changePrice, createProduct } from "@/core/catalog/products";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

// Sesión controlada por el test: null simula una petición sin cookie.
const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: UserRole } }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    session.current ? { ...session.current, expiresAt: Date.now() + 60_000 } : {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { createProductAction } = await import("@/app/(staff)/admin/products/actions");
const { changePriceAction, adjustAction } = await import("@/app/(staff)/admin/products/[id]/actions");

const form = (data: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
};

let phone = 200;
async function draft(text: string) {
  const result = await ingestInboundMessage({ phoneE164: `+41790000${phone++}`, text, channel: "SIMULATOR" });
  if (result.status !== "drafted") throw new Error(result.status);
  return result.order;
}

describe("catálogo: alta y precio (US-15)", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    userId = (await createEmployee()).id;
    session.current = null;
  });

  describe("alta de producto", () => {
    it("crea el producto y registra las existencias iniciales como INTAKE", async () => {
      const result = await createProduct({ name: "Picanha", unit: "WEIGHT_KG", priceCents: 4800, initialStock: "6" }, userId);

      expect(result.ok).toBe(true);
      const picanha = await db.product.findUniqueOrThrow({ where: { slug: "picanha" } });
      expect(picanha).toMatchObject({ name: "Picanha", pricePerUnitCents: 4800, isActive: true });
      expect(picanha.stockQuantity.toFixed(3)).toBe("6.000");
      const [movement] = await db.stockMovement.findMany({ where: { productId: picanha.id } });
      expect(movement).toMatchObject({ type: "INTAKE", userId });
      expect(movement.quantityDelta.toFixed(3)).toBe("6.000");
    });

    it("el producto nuevo entra en la interpretación de pedidos", async () => {
      await createProduct({ name: "Picanha", unit: "WEIGHT_KG", priceCents: 4800, initialStock: "6" }, userId);
      const order = await draft("2 kg de picanha");
      expect(order.totalCents).toBe(9600);
    });

    it("rechaza un nombre que ya existe aunque cambien acentos o mayúsculas", async () => {
      expect(await createProduct({ name: "ENTRECÔT", unit: "WEIGHT_KG", priceCents: 4000 }, userId)).toEqual({
        ok: false,
        code: "DUPLICATE",
      });
      expect(await db.product.count()).toBe(3);
    });

    it("rechaza existencias fraccionarias en un producto por pieza", async () => {
      expect(await createProduct({ name: "Hamburguesa", unit: "PIECE", priceCents: 350, initialStock: "2.5" }, userId)).toEqual({
        ok: false,
        code: "INVALID_QUANTITY",
      });
      expect(await db.stockMovement.count()).toBe(0);
    });
  });

  describe("cambio de precio", () => {
    it("revalora los borradores y no toca los pedidos confirmados", async () => {
      const confirmed = await draft("1 kg de entrecot");
      await confirmOrder(confirmed.id, userId);
      const open = await draft("1,5 kg de entrecot y 6 salchichas");
      const entrecot = await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } });

      expect(await changePrice(entrecot.id, 4200)).toEqual({ ok: true, productId: entrecot.id });

      const openLine = await db.orderItem.findFirstOrThrow({ where: { orderId: open.id, productId: entrecot.id } });
      expect(openLine).toMatchObject({ unitPriceCents: 4200, lineTotalCents: 6300 });
      expect((await db.order.findUniqueOrThrow({ where: { id: open.id } })).totalCents).toBe(6300 + 1140);
      const confirmedLine = await db.orderItem.findFirstOrThrow({ where: { orderId: confirmed.id } });
      expect(confirmedLine).toMatchObject({ unitPriceCents: 3900, lineTotalCents: 3900 });
      expect((await db.order.findUniqueOrThrow({ where: { id: confirmed.id } })).totalCents).toBe(3900);
    });

    it("con una confirmación simultánea el pedido queda valorado con un único precio", async () => {
      const order = await draft("2 kg de entrecot");
      const entrecot = await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } });

      const [result] = await Promise.all([confirmOrder(order.id, userId), changePrice(entrecot.id, 4200)]);

      const saved = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      expect([7800, 8400]).toContain(saved.totalCents);
      expect(saved.items[0].lineTotalCents).toBe(saved.totalCents);
      if (result.kind !== "confirmed") throw new Error(result.kind);
      const summary = await db.message.findFirstOrThrow({ where: { body: { contains: "está confirmado" } } });
      expect(summary.body).toContain(`CHF ${(saved.totalCents / 100).toFixed(2)}`);
    });
  });

  describe("permisos en las server actions", () => {
    it("un EMPLOYEE no puede dar de alta productos ni cambiar precios", async () => {
      session.current = { userId, role: "EMPLOYEE" };
      const entrecot = await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } });

      const created = await createProductAction({}, form({ name: "Picanha", unit: "WEIGHT_KG", price: "48" }));
      const priced = await changePriceAction({}, form({ productId: entrecot.id, price: "50" }));

      expect(created.error).toBeDefined();
      expect(priced.error).toBeDefined();
      expect(await db.product.count()).toBe(3);
      expect((await db.product.findUniqueOrThrow({ where: { id: entrecot.id } })).pricePerUnitCents).toBe(3900);
    });

    it("un ADMIN cambia el precio y la validación rechaza importes no válidos", async () => {
      session.current = { userId, role: "ADMIN" };
      const entrecot = await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } });

      for (const price of ["0", "-5", "doce", "12,345"]) {
        expect((await changePriceAction({}, form({ productId: entrecot.id, price }))).error).toBeDefined();
      }
      expect((await changePriceAction({}, form({ productId: entrecot.id, price: "42,50" }))).ok).toBeDefined();
      expect((await db.product.findUniqueOrThrow({ where: { id: entrecot.id } })).pricePerUnitCents).toBe(4250);
    });

    it("sin sesión, un reajuste se rechaza sin registrar nada", async () => {
      const entrecot = await db.product.findUniqueOrThrow({ where: { slug: "entrecot" } });
      const result = await adjustAction(
        {},
        form({ productId: entrecot.id, counted: "1", expected: "5.000", reason: "Conteo" }),
      );
      expect(result.error).toBeDefined();
      expect(await db.stockMovement.count()).toBe(0);
      expect((await db.product.findUniqueOrThrow({ where: { id: entrecot.id } })).stockQuantity.toFixed(3)).toBe("5.000");
    });
  });
});
