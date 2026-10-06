import type { AssemblyQueue, AssemblyQueueOrder } from "@/core/orders/assemblyQueue";

/** Por qué la vista puede estar desactualizada; `null` si el último refresco salió bien. */
export type StaleReason = "unreachable" | "session";

export type QueueViewState = { orders: AssemblyQueueOrder[]; updatedAt: string; stale: StaleReason | null };

export type RefreshOutcome = { ok: true; queue: AssemblyQueue } | { ok: false; reason: StaleReason };

export const REFRESH_INTERVAL_MS = 20_000;

/** Comprobación defensiva de forma: un cuerpo inesperado cuenta como fallo, no como cola vacía. */
function isQueue(body: unknown): body is AssemblyQueue {
  if (!body || typeof body !== "object") return false;
  const { orders, generatedAt } = body as Partial<AssemblyQueue>;
  return Array.isArray(orders) && typeof generatedAt === "string";
}

export async function fetchQueue(fetchImpl: typeof fetch = fetch): Promise<RefreshOutcome> {
  try {
    const res = await fetchImpl("/api/orders/assembly-queue", { cache: "no-store" });
    if (res.status === 401) return { ok: false, reason: "session" };
    if (!res.ok) return { ok: false, reason: "unreachable" };
    const body: unknown = await res.json();
    return isQueue(body) ? { ok: true, queue: body } : { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Ante un fallo se conservan los últimos pedidos conocidos y su hora: nunca se vacía la cola por error. */
export function applyRefresh(state: QueueViewState, outcome: RefreshOutcome): QueueViewState {
  if (!outcome.ok) return { ...state, stale: outcome.reason };
  return { orders: outcome.queue.orders, updatedAt: outcome.queue.generatedAt, stale: null };
}
