import { z } from "zod";
import { OrderIdSchema, QuantityInputSchema } from "./orders";

export const ProductIdSchema = OrderIdSchema;

/** Precio tal como lo escribe el dueño: CHF con coma o punto y hasta dos decimales, a céntimos. */
export const PriceInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,5}([.,]\d{1,2})?$/, "Precio no válido: CHF con hasta dos decimales, por ejemplo 42,50")
  .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
  .refine((cents) => cents > 0, "El precio debe ser mayor que cero");

/** Existencias contadas: como una cantidad, pero el cero es válido (cámara vacía). */
export const StockInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,3})?$/, "Cantidad no válida")
  .transform((v) => v.replace(",", "."));

export const CreateProductSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(60, "Nombre demasiado largo"),
  unit: z.enum(["WEIGHT_KG", "PIECE"], { message: "Unidad no válida" }),
  price: PriceInputSchema,
  initialStock: z.union([z.literal(""), StockInputSchema]).optional(),
});

export const ChangePriceSchema = z.object({ productId: ProductIdSchema, price: PriceInputSchema });

export const IntakeSchema = z.object({ productId: ProductIdSchema, quantity: QuantityInputSchema });

export const AdjustSchema = z.object({
  productId: ProductIdSchema,
  counted: StockInputSchema,
  expected: z.string().regex(/^\d{1,7}(\.\d{1,3})?$/, "Recargá la página e intentá de nuevo"),
  reason: z.string().trim().min(1, "Indicá el motivo del reajuste").max(200, "Motivo demasiado largo"),
});
