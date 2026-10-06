"use client";

import { useActionState } from "react";
import { intakeAction } from "@/app/(staff)/admin/products/[id]/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

/** Ingreso de lo recién envasado: se suma a lo disponible. */
export function StockIntakeForm({ productId, unitLabel }: { productId: string; unitLabel: string }) {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(intakeAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm shadow-sm">
      <input type="hidden" name="productId" value={productId} />
      <span className="font-medium">Ingreso de envasado</span>
      <span className="text-stone-500">+</span>
      <input name="quantity" aria-label="Cantidad ingresada" required inputMode="decimal" placeholder="5"
        className="w-20 rounded border border-stone-300 px-2 py-1" />
      <span className="text-stone-500">{unitLabel}</span>
      <button disabled={pending} className="rounded border border-red-800 px-3 py-1 text-red-800 disabled:opacity-50">
        {pending ? "Registrando…" : "Registrar ingreso"}
      </button>
      {state.error && <span role="status" className="w-full text-red-700">{state.error}</span>}
      {state.ok && <span role="status" className="w-full text-green-700">{state.ok}</span>}
    </form>
  );
}
