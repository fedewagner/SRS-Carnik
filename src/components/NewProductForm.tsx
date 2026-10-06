"use client";

import { useActionState } from "react";
import { createProductAction } from "@/app/(staff)/admin/products/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

/** Alta de producto (sólo ADMIN). Las existencias iniciales quedan como un ingreso. */
export function NewProductForm() {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(createProductAction, {});
  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 p-4 text-sm">
      <span className="card-title w-full">Nuevo producto</span>
      <label className="flex flex-col gap-1">
        <span className="field-label">Nombre</span>
        <input name="name" required maxLength={60} className="input w-48" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Unidad</span>
        <select name="unit" className="input">
          <option value="WEIGHT_KG">por kg</option>
          <option value="PIECE">por pieza</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Precio (CHF)</span>
        <input name="price" required inputMode="decimal" placeholder="42,50" className="input w-24" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Existencias iniciales</span>
        <input name="initialStock" inputMode="decimal" placeholder="0" className="input w-24" />
      </label>
      <button disabled={pending} className="btn-primary">
        {pending ? "Guardando…" : "Dar de alta"}
      </button>
      {state.error && <span role="status" className="text-error w-full">{state.error}</span>}
      {state.ok && <span role="status" className="text-success w-full">{state.ok}</span>}
    </form>
  );
}
