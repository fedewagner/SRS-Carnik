"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Line = { orderItemId: string; productName: string; requested: string; available: string };
type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "insufficient"; lines: Line[] }
  | { kind: "error"; message: string };

/** Estados de CARNIK-FE-01: inicial, carga, 409 señalando la línea, error genérico y sin líneas. */
export function ConfirmOrderButton({ orderId, hasLines }: { orderId: string; hasLines: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function confirm() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.code === "INSUFFICIENT_STOCK") {
        setState({ kind: "insufficient", lines: body.lines });
      } else if (res.status === 401) {
        router.push("/login");
      } else {
        setState({ kind: "error", message: body.message ?? "No se pudo confirmar. Probá de nuevo." });
      }
    } catch {
      setState({ kind: "error", message: "Sin conexión. Probá de nuevo." });
    }
  }

  if (!hasLines) {
    return <p className="rounded-lg border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500">El pedido no tiene líneas reconocidas: no se puede confirmar.</p>;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={confirm}
        disabled={state.kind === "loading"}
        className="btn-primary btn-lg"
      >
        {state.kind === "loading" ? "Confirmando…" : "Confirmar pedido"}
      </button>
      {state.kind === "insufficient" && (
        <div role="alert" className="alert-error p-3">
          <p className="font-medium">No hay existencias suficientes:</p>
          <ul className="mt-1 list-disc pl-5">
            {state.lines.map((l) => (
              <li key={l.orderItemId}>
                {l.productName}: pedido {Number(l.requested)}, disponible {Number(l.available)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.kind === "error" && <p role="alert" className="alert-error">{state.message}</p>}
    </div>
  );
}
