import { describe, expect, it } from "vitest";
import { clearFailures, isLocked, MAX_FAILURES, recordFailure, WINDOW_MS } from "@/lib/auth/loginThrottle";

describe("freno del login", () => {
  it("bloquea tras el máximo de fallos y libera al cerrar la ventana", () => {
    const email = "bloqueo@carnik.test";
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure(email, t0);
    expect(isLocked(email, t0)).toBe(false);
    recordFailure(email, t0);
    expect(isLocked(email, t0 + 1)).toBe(true);
    expect(isLocked(email, t0 + WINDOW_MS)).toBe(false);
  });

  it("un acierto borra los fallos acumulados", () => {
    const email = "acierto@carnik.test";
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure(email);
    clearFailures(email);
    expect(isLocked(email)).toBe(false);
  });

  it("los emails se cuentan por separado", () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("a@carnik.test");
    expect(isLocked("b@carnik.test")).toBe(false);
  });
});
