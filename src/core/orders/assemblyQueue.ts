import type { Prisma, ProductUnit } from "@prisma/client";
import { listAssemblyQueue } from "./queries";

const TIME_ZONE = "Europe/Zurich";
const NAME_MAX = 24;

/** Pedido tal como lo ve la pantalla del obrador: sin teléfono ni conversación (US-13). */
export type AssemblyQueueOrder = {
  id: string;
  reference: string;
  customerName: string;
  confirmedAt: string;
  confirmedTime: string;
  lines: { id: string; productName: string; quantityLabel: string }[];
};

export type AssemblyQueue = { orders: AssemblyQueueOrder[]; generatedAt: string };

/** Desfase de Zurich respecto de UTC en ese instante, en milisegundos (+1 h o +2 h). */
function zurichOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Medianoche de hoy en Zurich, como instante UTC. Los cambios de hora son a las 2–3 h, nunca a medianoche. */
export function startOfZurichDay(now: Date): Date {
  const local = new Date(now.getTime() + zurichOffsetMs(now));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightAsUtc - zurichOffsetMs(new Date(midnightAsUtc)));
}

/** Sólo el nombre de pila: el nombre de perfil de WhatsApp lo elige el cliente y puede traer apellido. */
export function firstNameOrDefault(profileName: string | null): string {
  const first = profileName?.trim().split(/\s+/)[0] ?? "";
  return first ? first.slice(0, NAME_MAX) : "Cliente";
}

/** Mismo formato que el resumen que recibe el cliente al confirmar. */
export function quantityLabel(quantity: Prisma.Decimal.Value, unit: ProductUnit): string {
  return unit === "PIECE" ? `${Number(quantity)} u.` : `${Number(quantity)} kg`;
}

export function formatZurichTime(instant: Date): string {
  return instant.toLocaleTimeString("es-CH", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

/** Pedidos confirmados hoy (Europe/Zurich), del más antiguo al más reciente (design.md A1). */
export async function getAssemblyQueue(now = new Date()): Promise<AssemblyQueue> {
  const rows = await listAssemblyQueue(startOfZurichDay(now));
  return {
    generatedAt: now.toISOString(),
    orders: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      customerName: firstNameOrDefault(o.customer.profileName),
      confirmedAt: o.confirmedAt!.toISOString(),
      confirmedTime: formatZurichTime(o.confirmedAt!),
      lines: o.items.map((i) => ({
        id: i.id,
        productName: i.product!.name,
        quantityLabel: quantityLabel(i.quantity, i.product!.unit),
      })),
    })),
  };
}
