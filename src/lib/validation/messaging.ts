import { z } from "zod";
import { OrderIdSchema } from "./orders";

export const PhoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Número en formato E.164, p. ej. +41791234567");

export const SimulatedMessageSchema = z.object({
  phoneE164: PhoneE164Schema,
  profileName: z.string().trim().max(100).optional(),
  text: z.string().trim().min(1).max(4096),
});

/** Campos del webhook de Twilio que usamos. Se valida después de verificar la firma. */
export const TwilioInboundSchema = z.object({
  MessageSid: z.string().regex(/^[A-Z]{2}[0-9a-f]{32}$/),
  From: z.string().startsWith("whatsapp:"),
  Body: z.string().max(4096).default(""),
  ProfileName: z.string().max(100).optional(),
  NumMedia: z.coerce.number().int().min(0).default(0),
});

/**
 * Límite de un mensaje de WhatsApp vía Twilio; es el mismo con el que outbound.ts trunca
 * los textos automáticos. Un texto humano no se trunca: se rechaza (US-12).
 */
export const MANUAL_MESSAGE_MAX = 1600;

export const ManualMessageSchema = z.object({
  orderId: OrderIdSchema,
  body: z
    .string()
    .trim()
    .min(1, "Escribí un mensaje antes de enviarlo.")
    .max(MANUAL_MESSAGE_MAX, `El mensaje supera los ${MANUAL_MESSAGE_MAX} caracteres que admite WhatsApp.`),
});
