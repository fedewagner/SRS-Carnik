import { z } from "zod";

export const OrderIdSchema = z.string().regex(/^c[a-z0-9]{20,32}$/, "Identificador no válido");

/** Cantidad tal como la escribe el empleado: admite coma decimal y hasta gramos. */
export const QuantityInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,3})?$/, "Cantidad no válida")
  .transform((v) => v.replace(",", "."))
  .refine((v) => Number(v) > 0, "La cantidad debe ser mayor que cero");

export const UpdateLineSchema = z.object({
  orderId: OrderIdSchema,
  itemId: OrderIdSchema,
  quantity: QuantityInputSchema,
});

export const RemoveLineSchema = z.object({ orderId: OrderIdSchema, itemId: OrderIdSchema });

export const AddLineSchema = z.object({
  orderId: OrderIdSchema,
  productId: OrderIdSchema,
  quantity: QuantityInputSchema,
});
