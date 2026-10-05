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
    <form action={action} className="space-y-2 rounded-lg bg-white p-3 text-sm shadow-sm">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="expected" value={stock} />
      <span className="font-medium">Reajuste por conteo</span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <dt className="text-stone-500">Disponible ahora</dt>
        <dd data-testid="adjust-stock">{show(Number(stock), unitLabel)}</dd>
        <dt className="text-stone-500">Comprometido hoy</dt>
        <dd data-testid="adjust-committed">{show(Number(committed), unitLabel)}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Contado en el depósito</span>
          <input name="counted" aria-label="Cantidad contada" required inputMode="decimal" value={counted}
            onChange={(e) => setCounted(e.target.value)} className="w-20 rounded border border-stone-300 px-2 py-1" />
          <span className="text-stone-500">{unitLabel}</span>
        </label>
        <input name="reason" aria-label="Motivo" required maxLength={200} placeholder="Motivo (merma, error de carga…)"
          className="min-w-48 flex-1 rounded border border-stone-300 px-2 py-1" />
      </div>
      {hasCount && (
        <p data-testid="adjust-preview" className={resulting < 0 ? "text-red-700" : "text-stone-700"}>
          {resulting < 0
            ? "Lo contado no cubre lo comprometido hoy."
            : `Quedarán ${show(resulting, unitLabel)} disponibles (${delta >= 0 ? "+" : ""}${show(delta, unitLabel)}).`}
        </p>
      )}
      <button disabled={pending} className="rounded bg-red-800 px-3 py-1.5 text-white disabled:opacity-50">
        {pending ? "Guardando…" : "Guardar reajuste"}
      </button>
      {state.error && <p role="status" className="text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-green-700">{state.ok}</p>}
    </form>
  );
}
