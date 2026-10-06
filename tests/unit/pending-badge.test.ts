import { describe, expect, it } from "vitest";
import {
  badgeLabel,
  countChanged,
  INITIAL_BADGE_STATE,
  nextBadgeState,
  parsePendingCount,
} from "@/components/pendingBadgeState";

describe("badge de pendientes (US-07)", () => {
  it("una respuesta correcta fija el número y quita la marca", () => {
    const state = nextBadgeState({ count: 2, stale: true }, parsePendingCount(200, { count: 3 }));
    expect(state).toEqual({ count: 3, stale: false });
    expect(badgeLabel(state)).toBe("3 por confirmar");
  });

  it("cero pendientes reales se muestra como cero", () => {
    expect(badgeLabel(nextBadgeState(INITIAL_BADGE_STATE, parsePendingCount(200, { count: 0 })))).toBe(
      "0 por confirmar",
    );
  });

  it.each([
    ["un error del servidor", parsePendingCount(500, { code: "INTERNAL" })],
    ["una sesión caducada", parsePendingCount(401, { code: "UNAUTHENTICATED" })],
    ["un fallo de red", { ok: false } as const],
  ])("ante %s conserva el último valor y lo marca desactualizado", (_name, result) => {
    const state = nextBadgeState({ count: 4, stale: false }, result);
    expect(state).toEqual({ count: 4, stale: true });
    expect(badgeLabel(state)).toBe("4 por confirmar");
  });

  it("si falla la primera consulta no inventa un cero", () => {
    const state = nextBadgeState(INITIAL_BADGE_STATE, { ok: false });
    expect(state).toEqual({ count: null, stale: true });
    expect(badgeLabel(state)).toBe("…");
  });

  it.each([
    ["sin cuerpo", null],
    ["sin campo", {}],
    ["negativo", { count: -1 }],
    ["fraccionario", { count: 1.5 }],
    ["texto", { count: "0" }],
  ])("un cuerpo inválido (%s) es un fallo, no un cero", (_name, body) => {
    expect(parsePendingCount(200, body)).toEqual({ ok: false });
  });

  it("se recupera tras un fallo", () => {
    let state = nextBadgeState({ count: 1, stale: false }, { ok: false });
    state = nextBadgeState(state, parsePendingCount(200, { count: 2 }));
    expect(state).toEqual({ count: 2, stale: false });
  });

  it("sólo cuenta como cambio una diferencia entre valores conocidos", () => {
    expect(countChanged({ count: 1, stale: false }, { count: 2, stale: false })).toBe(true);
    expect(countChanged(INITIAL_BADGE_STATE, { count: 2, stale: false })).toBe(false);
    expect(countChanged({ count: 2, stale: false }, { count: 2, stale: true })).toBe(false);
  });
});
