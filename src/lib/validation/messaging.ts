import { z } from "zod";

export const SimulatedMessageSchema = z.object({
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/, "Número en formato E.164, p. ej. +41791234567"),
  profileName: z.string().trim().max(100).optional(),
  text: z.string().trim().min(1).max(4096),
});
