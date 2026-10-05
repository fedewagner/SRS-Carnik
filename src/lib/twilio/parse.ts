import type { InboundMessage } from "@/core/messaging/types";
import { PhoneE164Schema, TwilioInboundSchema } from "@/lib/validation/messaging";

export type ParsedTwilioMessage =
  | { kind: "text"; message: InboundMessage }
  | { kind: "media"; message: InboundMessage }
  | { kind: "invalid" };

/** Formulario de Twilio → InboundMessage del dominio. Nada fuera de este módulo conoce a Twilio. */
export function parseTwilioForm(params: Record<string, string>): ParsedTwilioMessage {
  const parsed = TwilioInboundSchema.safeParse(params);
  if (!parsed.success) return { kind: "invalid" };

  const phone = PhoneE164Schema.safeParse(parsed.data.From.slice("whatsapp:".length));
  if (!phone.success) return { kind: "invalid" };

  const base = {
    phoneE164: phone.data,
    profileName: parsed.data.ProfileName ?? null,
    providerMessageId: parsed.data.MessageSid,
    channel: "WHATSAPP" as const,
  };

  // El adjunto no se descarga: queda constancia del mensaje sin su contenido (T7).
  if (parsed.data.NumMedia > 0) return { kind: "media", message: { ...base, text: "[adjunto no procesado]" } };

  const text = parsed.data.Body.trim();
  if (!text) return { kind: "invalid" };
  return { kind: "text", message: { ...base, text } };
}
