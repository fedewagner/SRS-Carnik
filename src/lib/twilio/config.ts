export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
  webhookUrl: string;
};

/**
 * Configuración del canal Twilio. Devuelve null si falta cualquier variable:
 * el webhook trata eso como canal cerrado, nunca como canal abierto (T2, T8).
 */
export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
  if (!accountSid || !authToken || !whatsappFrom || !webhookUrl) return null;
  return { accountSid, authToken, whatsappFrom, webhookUrl };
}
