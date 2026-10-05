import twilio from "twilio";
import type { TwilioConfig } from "./config";

/** Envía un WhatsApp por la API de Twilio. Lanza si Twilio rechaza el envío. */
export async function sendTwilioWhatsApp(config: TwilioConfig, toE164: string, body: string) {
  const client = twilio(config.accountSid, config.authToken);
  const message = await client.messages.create({
    from: config.whatsappFrom,
    to: `whatsapp:${toE164}`,
    body,
  });
  return message.sid;
}
