import { beforeEach, describe, expect, it } from "vitest";
import { committedToday, startOfShopDay } from "@/core/catalog/committed";
import { adjustToCount, registerIntake } from "@/core/catalog/stock";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

let phone = 100;
async function draft(text: string) {
  const result = await ingestInboundMessage({ phoneE164: `+41790000${phone++}`, text, channel: "SIMULATOR" });
  if (result.status !== "drafted") throw new Error(result.status);
  return result.order;
}

const product = (slug: string) => db.product.findUniqueOrThrow({ where: { slug } });
const stockOf = async (slug: string) => (await product(slug)).stockQuantity.toFixed(3);
const movementsOf = async (slug: string) =>
  db.stockMovement.findMany({ where: { product: { slug } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

/** Invariante de D1: el resultado del último movimiento coincide con las existencias. */
async function expectLedgerMatches(slug: string) {
  const movements = await movementsOf(slug);
  expect(movements.at(-1)!.resultingQuantity.toFixed(3)).toBe(await stockOf(slug));
}

describe("existencias del catálogo (US-15)", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    userId = (await createEmployee()).id;
  });

  describe("ingreso", () => {
    it("suma lo envasado, registra el INTAKE y recalcula el aviso del borrador", async () => {
      const order = await draft("7 kg de entrecot"); // hay 5 kg: aviso
      const entrecot = await product("entrecot");

      expect(await registerIntake(entrecot.id, "5", userId)).toEqual({ ok: true });

      expect(await stockOf("entrecot")).toBe("10.000");
      const [movement] = await movementsOf("entrecot");
      expect(movement).toMatchObject({ type: "INTAKE", userId });
      expect(movement.previousQuantity.toFixed(3)).toBe("5.000");
      expect(movement.quantityDelta.toFixed(3)).toBe("5.000");
      expect(movement.resultingQuantity.toFixed(3)).toBe("10.000");
      const line = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
      expect(line.hasStockWarning).toBe(false);
    });

    it("rechaza cero, negativos y fracciones en piezas sin tocar nada", async () => {
      const lyoner = await product("salchicha-lyoner");
      for (const q of ["0", "-3", "2.5"]) {
        expect(await registerIntake(lyoner.id, q, userId)).toEqual({ ok: false, code: "INVALID_QUANTITY" });
      }
      expect(await stockOf("salchicha-lyoner")).toBe("40.000");
      expect(await db.stockMovement.count()).toBe(0);
    });

    it("un ingreso simultáneo a una confirmación no pierde ninguno de los dos", async () => {
      const order = await draft("1 kg de entrecot");
      const entrecot = await product("entrecot");

      await Promise.all([confirmOrder(order.id, userId), registerIntake(entrecot.id, "5", userId)]);

      expect(await stockOf("entrecot")).toBe("9.000");
      const movements = await movementsOf("entrecot");
      expect(movements.map((m) => m.type).sort()).toEqual(["INTAKE", "ORDER_CONFIRMED"]);
      // Encadenados en el orden en que se serializaron: uno parte de 5 y el otro de su resultado.
      const first = movements.find((m) => m.previousQuantity.toFixed(3) === "5.000")!;
      const second = movements.find((m) => m !== first)!;
      expect(second.previousQuantity.toFixed(3)).toBe(first.resultingQuantity.toFixed(3));
      expect(second.resultingQuantity.toFixed(3)).toBe("9.000");
    });
  });

  describe("reajuste por conteo", () => {
    it("descuenta lo comprometido hoy y registra contado, comprometido y variación", async () => {
      const order = await draft("1,5 kg de entrecot");
      await confirmOrder(order.id, userId); // 5 → 3,5 disponibles, 1,5 comprometidos
      const entrecot = await product("entrecot");

      const result = await adjustToCount(
        { productId: entrecot.id, counted: "4", expected: "3.500", reason: "Merma por recorte" },
        userId,
      );

      expect(result).toEqual({ ok: true });
      expect(await stockOf("entrecot")).toBe("2.500");
      const adjustment = (await movementsOf("entrecot")).at(-1)!;
      expect(adjustment).toMatchObject({ type: "COUNT_ADJUSTMENT", reason: "Merma por recorte" });
      expect(adjustment.countedQuantity!.toFixed(3)).toBe("4.000");
      expect(adjustment.committedQuantity!.toFixed(3)).toBe("1.500");
      expect(adjustment.quantityDelta.toFixed(3)).toBe("-1.000");
      await expectLedgerMatches("entrecot");
    });

    it("rechaza un conteo inferior a lo comprometido", async () => {
      await confirmOrder((await draft("2 kg de entrecot")).id, userId);
      const entrecot = await product("entrecot");

      expect(
        await adjustToCount({ productId: entrecot.id, counted: "1", expected: "3.000", reason: "Conteo" }, userId),
      ).toEqual({ ok: false, code: "BELOW_COMMITTED" });
      expect(await stockOf("entrecot")).toBe("3.000");
    });

    it("rechaza si las existencias cambiaron desde que se abrió el formulario", async () => {
      const entrecot = await product("entrecot"); // el usuario ve 5,000
      await confirmOrder((await draft("1 kg de entrecot")).id, userId);

      expect(
        await adjustToCount({ productId: entrecot.id, counted: "6", expected: "5.000", reason: "Conteo" }, userId),
      ).toEqual({ ok: false, code: "STALE" });
      expect(await stockOf("entrecot")).toBe("4.000");
      expect((await movementsOf("entrecot")).map((m) => m.type)).toEqual(["ORDER_CONFIRMED"]);
    });

    it("exige motivo y respeta la unidad, pero admite contar cero", async () => {
      const cervelat = await product("cervelat");
      const base = { productId: cervelat.id, expected: "30.000" };

      expect(await adjustToCount({ ...base, counted: "10", reason: "  " }, userId)).toEqual({ ok: false, code: "REASON_REQUIRED" });
      expect(await adjustToCount({ ...base, counted: "2.5", reason: "Conteo" }, userId)).toEqual({ ok: false, code: "INVALID_QUANTITY" });
      expect(await db.stockMovement.count()).toBe(0);

      expect(await adjustToCount({ ...base, counted: "0", reason: "Cámara vacía" }, userId)).toEqual({ ok: true });
      expect(await stockOf("cervelat")).toBe("0.000");
    });
  });

  describe("comprometido hoy y libro de movimientos", () => {
    it("no cuenta los pedidos confirmados antes del inicio del día en Zúrich", async () => {
      const order = await draft("1 kg de entrecot");
      await confirmOrder(order.id, userId);
      const entrecot = await product("entrecot");
      expect((await committedToday([entrecot.id])).get(entrecot.id)?.toFixed(3)).toBe("1.000");

      await db.order.update({
        where: { id: order.id },
        data: { confirmedAt: new Date(startOfShopDay().getTime() - 10 * 60 * 1000) },
      });
      expect((await committedToday([entrecot.id])).get(entrecot.id)).toBeUndefined();
    });

    it("una confirmación revertida por falta de existencias no deja movimientos", async () => {
      const order = await draft("2 kg de entrecot y 6 salchichas");
      await db.product.update({ where: { slug: "salchicha-lyoner" }, data: { stockQuantity: "2" } });

      expect((await confirmOrder(order.id, userId)).kind).toBe("insufficient_stock");
      expect(await db.stockMovement.count()).toBe(0);
      expect(await stockOf("entrecot")).toBe("5.000");
    });

    it("cada línea confirmada con producto deja su ORDER_CONFIRMED enlazado al pedido", async () => {
      const order = await draft("2 kg de entrecot, 3 kg de cordero y 6 salchichas"); // el cordero no existe
      await confirmOrder(order.id, userId);

      const movements = await db.stockMovement.findMany({ where: { orderId: order.id } });
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.type === "ORDER_CONFIRMED" && m.userId === userId)).toBe(true);
      await expectLedgerMatches("entrecot");
      await expectLedgerMatches("salchicha-lyoner");
    });

    it("la confirmación recalcula el aviso de los demás borradores", async () => {
      const first = await draft("4 kg de entrecot");
      const second = await draft("2 kg de entrecot");
      await confirmOrder(first.id, userId); // quedan 1 kg

      const line = await db.orderItem.findFirstOrThrow({ where: { orderId: second.id } });
      expect(line.hasStockWarning).toBe(true);
    });
  });
});
