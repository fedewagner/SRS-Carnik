import { describe, expect, it } from "vitest";
import { MANUAL_MESSAGE_MAX, ManualMessageSchema } from "@/lib/validation/messaging";

const orderId = "c" + "a".repeat(24);

describe("ManualMessageSchema (US-12)", () => {
  it.each([
    ["vacío", ""],
    ["sólo espacios y saltos de línea", "  \n\t "],
  ])("rechaza un mensaje %s con el motivo", (_name, body) => {
    const result = ManualMessageSchema.safeParse({ orderId, body });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Escribí un mensaje/);
  });

  it("admite exactamente el límite del canal y rechaza un carácter más", () => {
    expect(ManualMessageSchema.safeParse({ orderId, body: "a".repeat(MANUAL_MESSAGE_MAX) }).success).toBe(true);
    const result = ManualMessageSchema.safeParse({ orderId, body: "a".repeat(MANUAL_MESSAGE_MAX + 1) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/1600 caracteres/);
  });

  it("recorta espacios antes de medir y conserva los saltos de línea internos", () => {
    const padded = `  ${"a".repeat(MANUAL_MESSAGE_MAX)}  `;
    expect(ManualMessageSchema.parse({ orderId, body: padded }).body).toHaveLength(MANUAL_MESSAGE_MAX);
    expect(ManualMessageSchema.parse({ orderId, body: " hola\nchau " }).body).toBe("hola\nchau");
  });

  it("rechaza un identificador de pedido mal formado", () => {
    expect(ManualMessageSchema.safeParse({ orderId: "../x", body: "hola" }).success).toBe(false);
  });
});
