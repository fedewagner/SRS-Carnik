import { describe, expect, it } from "vitest";
import { RuleBasedOrderDrafter } from "@/core/drafting/rules";
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
});
