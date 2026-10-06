"use client";

import { useEffect, useState } from "react";
import type { AssemblyQueue as Queue } from "@/core/orders/assemblyQueue";
import { applyRefresh, fetchQueue, REFRESH_INTERVAL_MS, type QueueViewState } from "./assemblyQueueState";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });

const STALE_TEXT = {
  unreachable: "No se pudo actualizar. Los datos pueden estar desactualizados.",
  session: "La sesión venció. Los datos pueden estar desactualizados: volvé a iniciar sesión.",
};

/** Cola de armado de solo lectura: sondea cada 20 s y conserva lo último si el sondeo falla (D13). */
export function AssemblyQueue({ initial }: { initial: Queue }) {
  const [state, setState] = useState<QueueViewState>({
    orders: initial.orders,
    updatedAt: initial.generatedAt,
    stale: null,
  });

  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      const outcome = await fetchQueue();
      if (active) setState((prev) => applyRefresh(prev, outcome));
    }, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="inline-flex items-center gap-2 text-sm text-stone-500" data-testid="queue-updated-at">
        <span aria-hidden className={`h-2 w-2 rounded-full ${state.stale ? "bg-amber-500" : "animate-pulse bg-emerald-500"}`} />
        Actualizado a las {time(state.updatedAt)}
      </p>
      {state.stale && (
        <p role="alert" data-testid="queue-stale" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-lg font-medium text-amber-900">
          {STALE_TEXT[state.stale]}
        </p>
      )}
      {state.orders.length === 0 ? (
        <p data-testid="queue-empty" className="card px-6 py-16 text-center font-display text-2xl text-stone-500">
          No hay pedidos por armar. La pantalla se actualiza sola.
        </p>
      ) : (
        <ol className="grid gap-4 md:grid-cols-2">
          {state.orders.map((o) => (
            <li key={o.id} data-testid="queue-order" className="card overflow-hidden border-l-4 border-l-brand-700 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-4xl font-bold tracking-tight text-brand-800">{o.reference}</span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-lg font-medium whitespace-nowrap text-stone-600 tabular-nums">{o.confirmedTime}</span>
              </div>
              <p className="mt-1 text-xl text-stone-700">{o.customerName}</p>
              <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100 text-2xl">
                {o.lines.map((l) => (
                  <li key={l.id} className="py-2">
                    <span className="mr-2 inline-block min-w-[4.5rem] font-bold whitespace-nowrap text-brand-800 tabular-nums">{l.quantityLabel}</span> {l.productName}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
