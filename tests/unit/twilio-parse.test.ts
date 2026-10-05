import { describe, expect, it } from "vitest";
import { parseTwilioForm } from "@/lib/twilio/parse";

const SID = "SM" + "a".repeat(32);
const form = (overrides: Record<string, string> = {}) => ({
  MessageSid: SID,
  From: "whatsapp:+41791234567",
  Body: "2 kg de entrecot",
  ProfileName: "Anna",
  NumMedia: "0",
  ...overrides,
});

describe("parseTwilioForm", () => {
  it("traduce un mensaje de texto al dominio", () => {
    expect(parseTwilioForm(form())).toEqual({
      kind: "text",
      message: {
        phoneE164: "+41791234567",
        profileName: "Anna",
        providerMessageId: SID,
        channel: "WHATSAPP",
        text: "2 kg de entrecot",
      },
    });
  });

  it("marca los adjuntos sin conservar su contenido", () => {
    const parsed = parseTwilioForm(form({ NumMedia: "1", MediaUrl0: "https://api.twilio.com/media/x" }));
    expect(parsed.kind).toBe("media");
    if (parsed.kind === "media") expect(parsed.message.text).toBe("[adjunto no procesado]");
  });

  it.each([
    ["remitente sin prefijo whatsapp:", { From: "+41791234567" }],
    ["remitente malformado", { From: "whatsapp:12345" }],
    ["sin MessageSid", { MessageSid: "" }],
    ["texto vacío", { Body: "   " }],
  ])("rechaza %s", (_name, overrides) => {
    expect(parseTwilioForm(form(overrides))).toEqual({ kind: "invalid" });
  });
});
