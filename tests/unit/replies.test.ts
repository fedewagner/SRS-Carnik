import { describe, expect, it } from "vitest";
import { REPEAT_OFFER_PREFIX, ackReply, greetingReply, questionReply } from "@/core/messaging/replies";

const last = [
  { quantity: 2, unit: "WEIGHT_KG" as const, productName: "Entrecot" },
  { quantity: 6, unit: "PIECE" as const, productName: "Salchicha Lyoner" },
];

describe("respuestas automáticas", () => {
  it("el acuse enumera lo interpretado y lo pendiente, sin precios", () => {
    const text = ackReply(last, ["2 kg de cordero"]);
    expect(text).toContain("Anotamos: 2 kg Entrecot y 6 u. Salchicha Lyoner.");
    expect(text).toContain("Revisamos a mano: «2 kg de cordero».");
    expect(text).not.toMatch(/CHF|total|disponib/i);
  });

  it("el saludo con historial ofrece repetir y lleva el marcador", () => {
    const text = greetingReply("Anna Muster", last);
    expect(text).toMatch(/^¡Hola Anna!/);
    expect(text).toContain(REPEAT_OFFER_PREFIX);
    expect(text).toContain("2 kg Entrecot y 6 u. Salchicha Lyoner");
  });

  it("el saludo sin historial invita con un ejemplo y no ofrece repetir", () => {
    const text = greetingReply(null, null);
    expect(text).toMatch(/^¡Hola! ¿Qué te preparamos hoy\?/);
    expect(text).not.toContain(REPEAT_OFFER_PREFIX);
  });

  it("no reenvía un nombre de perfil que parezca una instrucción", () => {
    expect(greetingReply("<script>alert(1)</script>", null)).toMatch(/^¡Hola! /);
    expect(greetingReply("https://phishing.test", null)).toMatch(/^¡Hola! /);
  });

  it("la consulta recibe un aviso neutro", () => {
    expect(questionReply()).toMatch(/persona del equipo/);
  });
});
