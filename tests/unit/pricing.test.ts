import { describe, expect, it } from "vitest";
import {
  boundedQuantity,
  formatChf,
  isValidLineQuantity,
  isValidQuantity,
  lineTotalCents,
  MAX_LINE_QUANTITY,
  normalizeQuantity,
} from "@/core/orders/pricing";

describe("lineTotalCents", () => {
  it("multiplica cantidad por precio en céntimos", () => {
    expect(lineTotalCents("2", 3900)).toBe(7800);
    expect(lineTotalCents("6", 190)).toBe(1140);
  });

  it("redondea half-up por línea, sin coma flotante", () => {
    expect(lineTotalCents("0.333", 1001)).toBe(333); // 333,333
    expect(lineTotalCents("0.500", 1001)).toBe(501); // 500,5
    expect(lineTotalCents("0.667", 1001)).toBe(668); // 667,667
    expect(lineTotalCents("1.5", 3900)).toBe(5850);
  });

  it("no arrastra errores binarios (0.1 + 0.2)", () => {
    expect(lineTotalCents("0.3", 100)).toBe(30);
  });
});

describe("isValidQuantity", () => {
  it("las piezas son enteras y positivas", () => {
    expect(isValidQuantity("PIECE", "6")).toBe(true);
    expect(isValidQuantity("PIECE", "1.5")).toBe(false);
    expect(isValidQuantity("PIECE", "0")).toBe(false);
  });

  it("el peso admite hasta gramos", () => {
    expect(isValidQuantity("WEIGHT_KG", "0.250")).toBe(true);
    expect(isValidQuantity("WEIGHT_KG", "0.2505")).toBe(false);
    expect(isValidQuantity("WEIGHT_KG", "-1")).toBe(false);
  });
});

describe("normalizeQuantity", () => {
  it("lleva la propuesta a lo que admite la unidad", () => {
    expect(normalizeQuantity("PIECE", 2.6).toString()).toBe("3");
    expect(normalizeQuantity("WEIGHT_KG", 0.12345).toString()).toBe("0.123");
  });
});

describe("tope de una línea", () => {
  it("admite hasta el tope y rechaza lo que desbordaría el total en céntimos", () => {
    expect(isValidLineQuantity("WEIGHT_KG", String(MAX_LINE_QUANTITY))).toBe(true);
    expect(isValidLineQuantity("WEIGHT_KG", "1000.001")).toBe(false);
    expect(isValidLineQuantity("PIECE", "600000")).toBe(false);
    expect(isValidLineQuantity("PIECE", "0")).toBe(false);
  });

  it("acota la cantidad de una mención sin resolver para que quepa en la base", () => {
    expect(boundedQuantity(99_999_999).toString()).toBe(String(MAX_LINE_QUANTITY));
    expect(boundedQuantity(-3).toString()).toBe("0");
    expect(boundedQuantity(Number.POSITIVE_INFINITY).toString()).toBe("0");
    expect(boundedQuantity(1.23456).toString()).toBe("1.235");
  });
});

describe("formatChf", () => {
  it("formatea céntimos como CHF", () => {
    expect(formatChf(8940)).toBe("CHF 89.40");
  });
});
