import { describe, expect, it } from "vitest";
import { intentByRules, isShortAffirmative } from "@/core/drafting/intent";

describe("intentByRules", () => {
  it.each([
    ["hola, me gustaría hacer un pedido", 0, "GREETING"],
    ["buenas!", 0, "GREETING"],
    ["hola! quiero 2 kg de entrecot", 1, "ORDER"],
    ["¿abren el sábado?", 0, "QUESTION"],
    ["tienen cordero", 0, "QUESTION"],
    ["lo de siempre por favor", 0, "REPEAT_LAST"],
    ["Lo mismo que la última vez", 0, "REPEAT_LAST"],
    ["repetí el último pedido", 0, "REPEAT_LAST"],
  ] as const)("«%s» → %s", (text, lines, expected) => {
    expect(intentByRules(text, lines)).toBe(expected);
  });
});

describe("isShortAffirmative", () => {
  it.each(["sí", "Si!", "dale", "ok", "sí, por favor", "perfecto."])("acepta «%s»", (t) => {
    expect(isShortAffirmative(t)).toBe(true);
  });
  it.each(["sí, pero sin salchichas", "si tenés entrecot mandame 2 kg", "hola"])("rechaza «%s»", (t) => {
    expect(isShortAffirmative(t)).toBe(false);
  });
});
