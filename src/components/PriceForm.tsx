"use client";

import { useActionState } from "react";
import { changePriceAction } from "@/app/(staff)/admin/products/[id]/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

/** Cambio de precio (sólo ADMIN). Revalora los borradores abiertos; los confirmados no cambian. */
export function PriceForm({ productId, currentCents, unitLabel }: { productId: string; currentCents: number; unitLabel: string }) {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(changePriceAction, {});
  return (
    <form action={action} className="card flex flex-wrap items-center gap-2 p-4 text-sm">
      <input type="hidden" name="productId" value={productId} />
      <span className="card-title w-full">Precio</span>
      <input name="price" aria-label="Nuevo precio" required inputMode="decimal"
        defaultValue={(currentCents / 100).toFixed(2).replace(".", ",")}
        className="input w-24 tabular-nums" />
      <span className="text-stone-500">CHF / {unitLabel}</span>
      <button disabled={pending} className="btn-secondary">
        {pending ? "Guardando…" : "Cambiar precio"}
      </button>
      <span className="w-full text-xs leading-relaxed text-stone-500">Se aplica también a los pedidos en borrador; los confirmados conservan su precio.</span>
      {state.error && <span role="status" className="text-error w-full">{state.error}</span>}
      {state.ok && <span role="status" className="text-success w-full">{state.ok}</span>}
    </form>
  );
}
