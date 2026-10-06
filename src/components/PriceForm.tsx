"use client";

import { useActionState } from "react";
import { changePriceAction } from "@/app/(staff)/admin/products/[id]/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

/** Cambio de precio (sólo ADMIN). Revalora los borradores abiertos; los confirmados no cambian. */
export function PriceForm({ productId, currentCents, unitLabel }: { productId: string; currentCents: number; unitLabel: string }) {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(changePriceAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm shadow-sm">
      <input type="hidden" name="productId" value={productId} />
      <span className="font-medium">Precio</span>
      <input name="price" aria-label="Nuevo precio" required inputMode="decimal"
        defaultValue={(currentCents / 100).toFixed(2).replace(".", ",")}
        className="w-24 rounded border border-stone-300 px-2 py-1" />
      <span className="text-stone-500">CHF / {unitLabel}</span>
      <button disabled={pending} className="rounded border border-red-800 px-3 py-1 text-red-800 disabled:opacity-50">
        {pending ? "Guardando…" : "Cambiar precio"}
      </button>
      <span className="w-full text-xs text-stone-500">Se aplica también a los pedidos en borrador; los confirmados conservan su precio.</span>
      {state.error && <span role="status" className="w-full text-red-700">{state.error}</span>}
      {state.ok && <span role="status" className="w-full text-green-700">{state.ok}</span>}
    </form>
  );
}
