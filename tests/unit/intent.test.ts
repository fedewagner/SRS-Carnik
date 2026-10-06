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

describe("intentByRules con productos consultados", () => {
  it("una consulta de catálogo sin signo de pregunta es consulta", () => {
    expect(intentByRules("precio del entrecot", 0, 1)).toBe("QUESTION");
  });
  it("las líneas prevalecen sobre los productos consultados (C2)", () => {
    expect(intentByRules("¿a cuánto está el entrecot? mandame 2 kg", 1, 1)).toBe("ORDER");
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
