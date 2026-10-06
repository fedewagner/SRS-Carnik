"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  badgeLabel,
  countChanged,
  INITIAL_BADGE_STATE,
  nextBadgeState,
  parsePendingCount,
  type BadgeState,
  type PollResult,
} from "./pendingBadgeState";

const POLL_INTERVAL_MS = 10_000;
// Menor que el intervalo: una petición colgada cuenta como fallo y no se solapa con la siguiente.
const REQUEST_TIMEOUT_MS = 8_000;

async function poll(): Promise<PollResult> {
  try {
    const res = await fetch("/api/orders/pending-count", {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return parsePendingCount(res.status, await res.json().catch(() => null));
  } catch {
    return { ok: false };
  }
}

/** Aviso de pedidos en borrador que se actualiza solo cada 10 s (D13). Nunca muestra cero por un error. */
export function PendingBadge() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<BadgeState>(INITIAL_BADGE_STATE);
  const stateRef = useRef(state);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function tick() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      const result = await poll();
      inFlight = false;
      if (cancelled) return;
      const prev = stateRef.current;
      const next = nextBadgeState(prev, result);
      stateRef.current = next;
      setState(next);
      // Sólo el listado: en el detalle el empleado puede estar editando una línea.
      if (countChanged(prev, next) && pathnameRef.current === "/admin/orders") router.refresh();
    }

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return (
    <Link
      href="/admin/orders"
      data-testid="pending-badge"
      data-stale={state.stale}
      title={state.stale ? "No se pudo actualizar: es el último valor conocido" : undefined}
      className={`-ml-1 mr-2 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums ring-1 ring-inset ${
        state.stale ? "bg-stone-100 text-stone-600 ring-stone-200" : "bg-brand-700 text-white ring-brand-800"
      }`}
    >
      {badgeLabel(state)}
      {state.stale && <span className="ml-1">· desactualizado</span>}
    </Link>
  );
}
