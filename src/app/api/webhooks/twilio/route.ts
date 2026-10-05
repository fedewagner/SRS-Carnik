import twilio from "twilio";
import { ingestInboundMessage, ingestUnsupportedMessage } from "@/core/messaging/ingest";
import { getTwilioConfig } from "@/lib/twilio/config";
import { parseTwilioForm } from "@/lib/twilio/parse";

/** Twilio sólo necesita un 2xx; las respuestas al cliente salen por el transporte, no por TwiML. */
const twiml = (status = 200) =>
  new Response("<Response/>", { status, headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  // Fallo cerrado: sin secreto con el que verificar, el canal no existe (spec, T2).
  const config = getTwilioConfig();
  if (!config) return twiml(403);

  const form = await req.formData().catch(() => null);
  if (!form) return twiml(400);
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  // La URL firmada es la configurada, nunca la reconstruida desde cabeceras del proxy (T2).
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!signature || !twilio.validateRequest(config.authToken, signature, config.webhookUrl, params)) {
    console.warn("Webhook de Twilio rechazado: firma inválida o ausente");
    return twiml(403);
  }

  const parsed = parseTwilioForm(params);
  if (parsed.kind === "invalid") {
    console.warn("Webhook de Twilio rechazado: formulario no válido");
    return twiml(400);
  }
  if (parsed.kind === "media") await ingestUnsupportedMessage(parsed.message);
  else await ingestInboundMessage(parsed.message);

  return twiml();
}
