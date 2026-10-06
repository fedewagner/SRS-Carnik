/**
 * Lógica del badge de pendientes, separada del componente para probarla sin DOM.
 * `count: null` significa «todavía no sé»: se muestra como «…», nunca como cero.
 */
export type BadgeState = { count: number | null; stale: boolean };
export type PollResult = { ok: true; count: number } | { ok: false };

export const INITIAL_BADGE_STATE: BadgeState = { count: null, stale: false };

/** Sólo un 200 con un entero no negativo es un dato; cualquier otra cosa es un fallo, no un cero. */
export function parsePendingCount(status: number, body: unknown): PollResult {
  if (status !== 200 || typeof body !== "object" || body === null) return { ok: false };
  const count = (body as { count?: unknown }).count;
  return Number.isInteger(count) && (count as number) >= 0 ? { ok: true, count: count as number } : { ok: false };
}

/** Ante un fallo conserva el último valor conocido y lo marca desactualizado. */
export function nextBadgeState(prev: BadgeState, result: PollResult): BadgeState {
  return result.ok ? { count: result.count, stale: false } : { count: prev.count, stale: true };
}

/** Hubo un cambio real respecto de un valor conocido: el listado merece refrescarse. */
export function countChanged(prev: BadgeState, next: BadgeState): boolean {
  return prev.count !== null && next.count !== null && prev.count !== next.count;
}

export function badgeLabel(state: BadgeState): string {
  return state.count === null ? "…" : `${state.count} por confirmar`;
}
