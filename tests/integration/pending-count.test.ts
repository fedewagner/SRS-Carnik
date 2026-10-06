import { sealData } from "iron-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { confirmOrder } from "@/core/orders/confirm";
import { db } from "@/lib/db";
import { createEmployee, resetDatabase, seedCatalog } from "../helpers/db";

// Cookie de sesión de la petición en curso; `undefined` equivale a no tener sesión.
let sessionCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "carnik_session" && sessionCookie ? { name, value: sessionCookie } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
}));

const { GET } = await import("@/app/api/orders/pending-count/route");

/** Sella la cookie como lo haría el login, para ejercitar el guard real. */
const sessionFor = (userId: string, expiresAt = Date.now() + 60_000) =>
  sealData({ userId, role: "EMPLOYEE", expiresAt }, { password: process.env.SESSION_SECRET! });

async function pendingCountAs(cookie: string | undefined) {
  sessionCookie = cookie;
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

async function draft(phoneE164: string) {
  const result = await ingestInboundMessage({ phoneE164, text: "2 kg de entrecot", channel: "SIMULATOR" });
  if (result.status !== "drafted") throw new Error(result.status);
  return result.order;
}

describe("GET /api/orders/pending-count (US-07)", () => {
  let employeeId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedCatalog();
    employeeId = (await createEmployee()).id;
    sessionCookie = undefined;
    vi.restoreAllMocks();
  });

  it("cuenta sólo los pedidos en borrador", async () => {
    const cookie = await sessionFor(employeeId);
    expect(await pendingCountAs(cookie)).toEqual({ status: 200, body: { count: 0 } });

    // «Aparece un pedido nuevo»: la siguiente consulta ya lo cuenta.
    const first = await draft("+41790000041");
    await draft("+41790000042");
    expect(await pendingCountAs(cookie)).toEqual({ status: 200, body: { count: 2 } });

    await confirmOrder(first.id, employeeId);
    expect(await pendingCountAs(cookie)).toEqual({ status: 200, body: { count: 1 } });
  });

  it("no se cachea", async () => {
    sessionCookie = await sessionFor(employeeId);
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
  });

  it("dos empleados dejan de contar el pedido que confirma uno de ellos", async () => {
    const other = await db.user.create({
      data: { email: "otra@carnik.test", role: "ADMIN", passwordHash: "x" },
    });
    const [mine, theirs] = await Promise.all([sessionFor(employeeId), sessionFor(other.id)]);
    const order = await draft("+41790000043");
    expect((await pendingCountAs(mine)).body.count).toBe(1);
    expect((await pendingCountAs(theirs)).body.count).toBe(1);

    await confirmOrder(order.id, other.id);

    expect((await pendingCountAs(mine)).body.count).toBe(0);
    expect((await pendingCountAs(theirs)).body.count).toBe(0);
  });

  it.each([
    ["sin sesión", async () => undefined],
    ["con la sesión caducada", async () => sessionFor("cnotexisting0000000000000", Date.now() - 1)],
    ["con una cookie manipulada", async () => "Fe26.2*manipulada"],
  ])("responde 401 %s sin tocar la base", async (_name, cookie) => {
    await draft("+41790000044");
    const spy = vi.spyOn(db.order, "count");
    expect(await pendingCountAs(await cookie())).toEqual({
      status: 401,
      body: { code: "UNAUTHENTICATED", message: "Sesión requerida" },
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
