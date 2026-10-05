"use client";

import { useActionState } from "react";
import { createProductAction } from "@/app/(staff)/admin/products/actions";
import type { CatalogActionState } from "@/app/(staff)/admin/products/messages";

/** Alta de producto (sólo ADMIN). Las existencias iniciales quedan como un ingreso. */
export function NewProductForm() {
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(createProductAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-3 text-sm shadow-sm">
      <span className="w-full font-medium">Nuevo producto</span>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-stone-500">Nombre</span>
        <input name="name" required maxLength={60} className="w-48 rounded border border-stone-300 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-stone-500">Unidad</span>
        <select name="unit" className="rounded border border-stone-300 px-2 py-1">
          <option value="WEIGHT_KG">por kg</option>
          <option value="PIECE">por pieza</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-stone-500">Precio (CHF)</span>
        <input name="price" required inputMode="decimal" placeholder="42,50" className="w-24 rounded border border-stone-300 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-stone-500">Existencias iniciales</span>
        <input name="initialStock" inputMode="decimal" placeholder="0" className="w-24 rounded border border-stone-300 px-2 py-1" />
      </label>
      <button disabled={pending} className="rounded bg-red-800 px-3 py-1.5 text-white disabled:opacity-50">
        {pending ? "Guardando…" : "Dar de alta"}
      </button>
      {state.error && <span role="status" className="w-full text-red-700">{state.error}</span>}
      {state.ok && <span role="status" className="w-full text-green-700">{state.ok}</span>}
    </form>
  );
}
