import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase, seedCatalog } from "../helpers/db";

// Petición sin cookie de sesión: el almacén de cookies de Next está vacío.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

const { POST: confirm } = await import("@/app/api/orders/[orderId]/confirm/route");
const { POST: simulate } = await import("@/app/api/simulator/messages/route");

describe("acceso sin sesión", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
  });

  it("la confirmación responde 401 sin tocar la base", async () => {
    const spy = vi.spyOn(db.order, "findUnique");
    const res = await confirm(new Request("http://test/api/orders/x/confirm", { method: "POST" }), {
      params: Promise.resolve({ orderId: "cnotexisting0000000000000" }),
    });
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("el simulador responde 401 y no crea mensajes", async () => {
    const res = await simulate(
      new Request("http://test/api/simulator/messages", {
        method: "POST",
        body: JSON.stringify({ phoneE164: "+41790000003", text: "1 kg de entrecot" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await db.message.count()).toBe(0);
  });

  it("el simulador responde 404 si está apagado, antes de mirar la sesión", async () => {
    vi.stubEnv("SIMULATOR_ENABLED", "false");
    const res = await simulate(new Request("http://test/api/simulator/messages", { method: "POST", body: "{}" }));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });
});
