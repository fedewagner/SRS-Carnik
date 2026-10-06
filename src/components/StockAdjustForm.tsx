"use client";

import { useActionState, useState } from "react";
import { adjustAction } from "@/app/(staff)/admin/products/[id]/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

type Props = { productId: string; unitLabel: string; stock: string; committed: string };

const show = (n: number, unit: string) => `${n.toLocaleString("es-CH", { maximumFractionDigits: 3 })} ${unit}`;

/**
 * Reajuste por conteo físico. Muestra lo comprometido hoy y anticipa el disponible
 * (contado − comprometido); el servidor lo recalcula siempre (D6). `expected` viaja oculto
 * para rechazar el guardado si las existencias cambiaron mientras se contaba.
 */
export function StockAdjustForm({ productId, unitLabel, stock, committed }: Props) {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(adjustAction, {});
  const [counted, setCounted] = useState("");
  const countedNumber = Number(counted.replace(",", "."));
  const hasCount = counted.trim() !== "" && Number.isFinite(countedNumber);
  const resulting = countedNumber - Number(committed);
  const delta = resulting - Number(stock);

  return (
    <form action={action} className="card space-y-3 p-4 text-sm">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="expected" value={stock} />
      <span className="card-title block">Reajuste por conteo</span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-stone-50 px-3 py-2 tabular-nums sm:grid-cols-4">
        <dt className="text-stone-500">Disponible ahora</dt>
        <dd data-testid="adjust-stock" className="font-medium">{show(Number(stock), unitLabel)}</dd>
        <dt className="text-stone-500">Comprometido hoy</dt>
        <dd data-testid="adjust-committed" className="font-medium">{show(Number(committed), unitLabel)}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Contado en el depósito</span>
          <input name="counted" aria-label="Cantidad contada" required inputMode="decimal" value={counted}
            onChange={(e) => setCounted(e.target.value)} className="input w-24 tabular-nums" />
          <span className="text-stone-500">{unitLabel}</span>
        </label>
        <input name="reason" aria-label="Motivo" required maxLength={200} placeholder="Motivo (merma, error de carga…)"
          className="input min-w-48 flex-1" />
      </div>
      {hasCount && (
        <p data-testid="adjust-preview" className={`rounded-lg px-3 py-2 ${resulting < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {resulting < 0
            ? "Lo contado no cubre lo comprometido hoy."
            : `Quedarán ${show(resulting, unitLabel)} disponibles (${delta >= 0 ? "+" : ""}${show(delta, unitLabel)}).`}
        </p>
      )}
      <button disabled={pending} className="btn-primary">
        {pending ? "Guardando…" : "Guardar reajuste"}
      </button>
      {state.error && <p role="status" className="text-error">{state.error}</p>}
      {state.ok && <p role="status" className="text-success">{state.ok}</p>}
    </form>
  );
}
