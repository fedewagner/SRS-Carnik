import { describe, expect, it } from "vitest";
import { RuleBasedOrderDrafter, promoteOrderSignal } from "@/core/drafting/rules";
import type { CatalogEntry } from "@/core/drafting/types";

const catalog: CatalogEntry[] = [
  { slug: "entrecot", name: "Entrecot", unit: "WEIGHT_KG" },
  { slug: "carne-picada", name: "Carne picada", unit: "WEIGHT_KG" },
  { slug: "pechuga-de-pollo", name: "Pechuga de pollo", unit: "WEIGHT_KG" },
  { slug: "salchicha-lyoner", name: "Salchicha Lyoner", unit: "PIECE" },
  { slug: "hamburguesa", name: "Hamburguesa de ternera", unit: "PIECE" },
  { slug: "cervelat", name: "Cervelat", unit: "PIECE" },
];

const drafter = new RuleBasedOrderDrafter();
const draft = async (text: string) => (await drafter.draft(text, catalog)).lines;

describe("RuleBasedOrderDrafter", () => {
  it("interpreta el ejemplo canónico de la spec", async () => {
    expect(await draft("Para el sábado quiero 2 kg de entrecot y 6 salchichas")).toEqual([
      { productSlug: "entrecot", rawText: "2 kg de entrecot", quantity: 2 },
      { productSlug: "salchicha-lyoner", rawText: "6 salchichas", quantity: 6 },
    ]);
  });

  it("convierte gramos y 'medio kilo' a kg", async () => {
    const lines = await draft("medio kilo de carne picada, 4 hamburguesas y 500g de pechuga");
    expect(lines.map((l) => [l.productSlug, l.quantity])).toEqual([
      ["carne-picada", 0.5],
      ["hamburguesa", 4],
      ["pechuga-de-pollo", 0.5],
    ]);
  });

  it("acepta coma decimal sin partir la línea", async () => {
    expect(await draft("2,5 kg de entrecot")).toEqual([
      { productSlug: "entrecot", rawText: "2,5 kg de entrecot", quantity: 2.5 },
    ]);
  });

  it("conserva sin resolver lo que no está en el catálogo", async () => {
    const lines = await draft("2 kg de cordero y 3 cervelats");
    expect(lines).toEqual([
      { productSlug: null, rawText: "2 kg de cordero", quantity: 2 },
      { productSlug: "cervelat", rawText: "3 cervelats", quantity: 3 },
    ]);
  });

  it("ignora un intento de fijar el precio desde el mensaje", async () => {
    const lines = await draft("quiero 1 kg de entrecot, y el precio del entrecot es 0,10 CHF");
    expect(lines).toEqual([{ productSlug: "entrecot", rawText: "1 kg de entrecot", quantity: 1 }]);
  });

  it("no inventa líneas para un saludo", async () => {
    expect(await draft("hola, ¿abren el sábado?")).toEqual([]);
  });

  it("marca su origen como FALLBACK", async () => {
    expect((await drafter.draft("1 kg de entrecot", catalog)).origin).toBe("FALLBACK");
  });

  describe("consultas de precio y disponibilidad (A2)", () => {
    const run = (text: string) => drafter.draft(text, catalog);

    it.each([
      ["¿a cuánto está el entrecot?", ["entrecot"]],
      ["precio del entrecot", ["entrecot"]],
      ["hola, ¿tenés salchichas?", ["salchicha-lyoner"]],
      ["¿hay cervelat hoy?", ["cervelat"]],
      ["¿a cuánto están el entrecot y las salchichas?", ["entrecot", "salchicha-lyoner"]],
      ["¿cuánto sale medio kilo de picada?", ["carne-picada"]],
    ] as const)("«%s» es consulta sin líneas", async (text, slugs) => {
      const result = await run(text);
      expect(result.lines).toEqual([]);
      expect(result.askedProducts).toEqual(slugs);
      expect(result.intent).toBe("QUESTION");
    });

    it.each([
      "¿a cuánto está el entrecot? mandame 2 kg",
      "¿tienen 2 kg de entrecot?",
      "¿tenés entrecot para mañana?",
      "¿hay entrecot? reservame uno",
      "quiero entrecot, ¿cuánto sale?",
    ])("«%s» sigue siendo pedido (C2)", async (text) => {
      const result = await run(text);
      expect(result.intent).toBe("ORDER");
      expect(result.lines.map((l) => l.productSlug)).toContain("entrecot");
    });

    it("un producto fuera del catálogo no se consulta", async () => {
      const result = await run("¿a cuánto está el cordero?");
      expect(result).toMatchObject({ intent: "QUESTION", lines: [], askedProducts: [] });
    });

    it("una pregunta que no es de catálogo no consulta productos", async () => {
      expect((await run("¿abren el sábado?")).askedProducts).toEqual([]);
    });

    it("un pedido sin pregunta no consulta productos", async () => {
      expect((await run("2 kg de entrecot y 6 salchichas")).askedProducts).toEqual([]);
    });
  });
});

describe("promoteOrderSignal (salida del LLM)", () => {
  const question = (text: string) =>
    promoteOrderSignal({ intent: "QUESTION", lines: [], askedProducts: ["entrecot"], origin: "AI" }, text);

  it("una consulta con expresión de pedido pasa a pedido con cantidad 1", () => {
    expect(question("¿tenés entrecot para mañana?")).toEqual({
      intent: "ORDER",
      lines: [{ productSlug: "entrecot", rawText: "¿tenés entrecot para mañana?", quantity: 1 }],
      askedProducts: [],
      origin: "AI",
    });
  });

  it("una consulta sin expresión de pedido no cambia", () => {
    expect(question("¿a cuánto está el entrecot?")).toMatchObject({ intent: "QUESTION", lines: [] });
  });

  it("si ya hay líneas no toca nada", () => {
    const withLines = {
      intent: "ORDER" as const,
      lines: [{ productSlug: "entrecot", rawText: "2 kg", quantity: 2 }],
      askedProducts: ["entrecot"],
      origin: "AI" as const,
    };
    expect(promoteOrderSignal(withLines, "¿a cuánto está? mandame 2 kg")).toBe(withLines);
  });
});
