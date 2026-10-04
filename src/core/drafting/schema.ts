import { z } from "zod";

/** Contrato de salida del intérprete: sin precios, sin totales, sin disponibilidad (D9). */
export const DraftLineSchema = z.object({
  productSlug: z
    .string()
    .nullable()
    .describe("Slug del catálogo, o null si la mención no corresponde a ningún producto"),
  rawText: z.string().describe("Fragmento literal del mensaje que describe esta línea"),
  quantity: z.number().positive().describe("Cantidad en la unidad del producto (kg o piezas)"),
});

export const DraftSchema = z.object({
  lines: z.array(DraftLineSchema),
});

export type DraftLine = z.infer<typeof DraftLineSchema>;
