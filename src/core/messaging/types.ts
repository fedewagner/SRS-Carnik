import type { MessageChannel } from "@prisma/client";

/** Mensaje entrante ya traducido en el borde. El núcleo no conoce a ningún proveedor. */
export type InboundMessage = {
  phoneE164: string;
  profileName?: string | null;
  text: string;
  providerMessageId?: string | null;
  channel: MessageChannel;
};
