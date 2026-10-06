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
      <p className="text-sm text-stone-500" data-testid="queue-updated-at">
        Actualizado a las {time(state.updatedAt)}
      </p>
      {state.stale && (
        <p role="alert" data-testid="queue-stale" className="rounded-lg bg-amber-100 px-4 py-3 text-lg font-medium text-amber-900">
          {STALE_TEXT[state.stale]}
        </p>
      )}
      {state.orders.length === 0 ? (
        <p data-testid="queue-empty" className="rounded-lg bg-white p-10 text-center text-2xl text-stone-500">
          No hay pedidos por armar. La pantalla se actualiza sola.
        </p>
      ) : (
        <ol className="grid gap-4 md:grid-cols-2">
          {state.orders.map((o) => (
            <li key={o.id} data-testid="queue-order" className="rounded-lg bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-4xl font-bold text-red-800">{o.reference}</span>
                <span className="text-lg whitespace-nowrap text-stone-500">{o.confirmedTime}</span>
              </div>
              <p className="mt-1 text-xl">{o.customerName}</p>
              <ul className="mt-3 space-y-1 text-2xl">
                {o.lines.map((l) => (
                  <li key={l.id}>
                    <span className="font-semibold whitespace-nowrap">{l.quantityLabel}</span> {l.productName}
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
