import { describe, expect, it, vi } from "vitest";
import { firstNameOrDefault, quantityLabel, startOfZurichDay } from "@/core/orders/assemblyQueue";
import type { AssemblyQueueOrder } from "@/core/orders/assemblyQueue";
import { applyRefresh, fetchQueue, type QueueViewState } from "@/components/assemblyQueueState";

describe("corte del día en Europe/Zurich", () => {
  it("en invierno la medianoche local es las 23:00 UTC del día anterior", () => {
    expect(startOfZurichDay(new Date("2026-01-15T10:00:00Z")).toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("en verano la medianoche local es las 22:00 UTC del día anterior", () => {
    expect(startOfZurichDay(new Date("2026-07-15T10:00:00Z")).toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("a las 00:30 locales ya cuenta el día nuevo, aunque en UTC sea todavía ayer", () => {
    expect(startOfZurichDay(new Date("2026-07-14T22:30:00Z")).toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("el día del cambio de hora toma la medianoche con el horario de invierno", () => {
    expect(startOfZurichDay(new Date("2026-03-29T12:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });
});

describe("proyección de la cola", () => {
  it.each([
    ["Ana María Pérez", "Ana"],
    ["  Luca  ", "Luca"],
    ["", "Cliente"],
    ["   ", "Cliente"],
    [null, "Cliente"],
  ])("el nombre %j se muestra como %j", (profileName, expected) => {
    expect(firstNameOrDefault(profileName)).toBe(expected);
  });

  it("recorta un nombre de pila desmedido", () => {
    expect(firstNameOrDefault("x".repeat(80))).toHaveLength(24);
  });

  it("formatea las cantidades como el resumen al cliente", () => {
    expect(quantityLabel("1.500", "WEIGHT_KG")).toBe("1.5 kg");
    expect(quantityLabel("6", "PIECE")).toBe("6 u.");
  });
});

describe("refresco de la vista", () => {
  const order: AssemblyQueueOrder = {
    id: "o1",
    reference: "CK-0001",
    customerName: "Ana",
    confirmedAt: "2026-10-05T08:00:00.000Z",
    confirmedTime: "10:00",
    lines: [{ id: "l1", productName: "Entrecot", quantityLabel: "1 kg" }],
  };
  const shown: QueueViewState = { orders: [order], updatedAt: "2026-10-05T08:00:00.000Z", stale: null };
  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("si la red falla conserva los pedidos y marca la vista como desactualizada", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const next = applyRefresh(shown, await fetchQueue(failing));
    expect(next.orders).toEqual([order]);
    expect(next.updatedAt).toBe(shown.updatedAt);
    expect(next.stale).toBe("unreachable");
  });

  it("un error del servidor no se lee como cola vacía", async () => {
    const next = applyRefresh(shown, await fetchQueue(respond(500, { code: "INTERNAL" })));
    expect(next.orders).toEqual([order]);
    expect(next.stale).toBe("unreachable");
  });

  it("un cuerpo sin la forma esperada tampoco vacía la cola", async () => {
    const next = applyRefresh(shown, await fetchQueue(respond(200, { orders: null })));
    expect(next.orders).toEqual([order]);
    expect(next.stale).toBe("unreachable");
  });

  it("con la sesión vencida avisa de la sesión y conserva los pedidos", async () => {
    const next = applyRefresh(shown, await fetchQueue(respond(401, { code: "UNAUTHENTICATED" })));
    expect(next.orders).toEqual([order]);
    expect(next.stale).toBe("session");
  });

  it("un refresco correcto reemplaza la lista y quita el aviso", async () => {
    const stale: QueueViewState = { ...shown, stale: "unreachable" };
    const next = applyRefresh(stale, await fetchQueue(respond(200, { orders: [], generatedAt: "2026-10-05T09:00:00.000Z" })));
    expect(next).toEqual({ orders: [], updatedAt: "2026-10-05T09:00:00.000Z", stale: null });
  });
});
