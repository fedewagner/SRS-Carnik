"use client";

import { useActionState } from "react";
import { intakeAction } from "@/app/(staff)/admin/products/[id]/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

/** Ingreso de lo recién envasado: se suma a lo disponible. */
export function StockIntakeForm({ productId, unitLabel }: { productId: string; unitLabel: string }) {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(intakeAction, {});
  return (
    <form action={action} className="card flex flex-wrap items-center gap-2 p-4 text-sm">
      <input type="hidden" name="productId" value={productId} />
      <span className="card-title w-full">Ingreso de envasado</span>
      <span className="text-stone-500">+</span>
      <input name="quantity" aria-label="Cantidad ingresada" required inputMode="decimal" placeholder="5"
        className="input w-24 tabular-nums" />
      <span className="text-stone-500">{unitLabel}</span>
      <button disabled={pending} className="btn-secondary">
        {pending ? "Registrando…" : "Registrar ingreso"}
      </button>
      {state.error && <span role="status" className="text-error w-full">{state.error}</span>}
      {state.ok && <span role="status" className="text-success w-full">{state.ok}</span>}
    </form>
  );
}
