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

export const INTENTS = ["ORDER", "GREETING", "QUESTION", "REPEAT_LAST"] as const;
export type Intent = (typeof INTENTS)[number];

export const DraftSchema = z.object({
  intent: z
    .enum(INTENTS)
    .describe(
      "ORDER si pide productos; GREETING si saluda o anuncia que quiere pedir sin decir qué; " +
        "QUESTION si pregunta algo sin pedir; REPEAT_LAST si pide repetir su pedido habitual o el último",
    ),
  lines: z.array(DraftLineSchema),
});

export type DraftLine = z.infer<typeof DraftLineSchema>;
