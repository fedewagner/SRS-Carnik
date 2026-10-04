import { z } from "zod";

export const OrderIdSchema = z.string().regex(/^c[a-z0-9]{20,32}$/, "Identificador no válido");
