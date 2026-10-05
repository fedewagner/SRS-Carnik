"use client";

import { useActionState } from "react";
import { addLineAction, type LineActionState } from "@/app/(staff)/admin/orders/[id]/actions";

import type { CatalogOption } from "./OrderLineRow";

/** Alta de una línea con un producto activo del catálogo. El precio lo pone el servidor. */
export function AddLineForm({ orderId, products }: { orderId: string; products: CatalogOption[] }) {
  const [state, action, pending] = useActionState<LineActionState, FormData>(addLineAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm shadow-sm">
      <input type="hidden" name="orderId" value={orderId} />
      <span className="font-medium">Añadir línea</span>
      <select name="productId" aria-label="Producto" required className="rounded border border-stone-300 px-2 py-1">
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.unit === "PIECE" ? "u." : "kg"}) · {Number(p.stockQuantity)} disp.
          </option>
        ))}
      </select>
      <input name="quantity" aria-label="Cantidad a añadir" required inputMode="decimal" placeholder="1"
        className="w-16 rounded border border-stone-300 px-2 py-1" />
      <button disabled={pending} className="rounded border border-red-800 px-3 py-1 text-red-800 disabled:opacity-50">
        {pending ? "Añadiendo…" : "Añadir"}
      </button>
      {state.error && <span role="status" className="text-red-700">{state.error}</span>}
    </form>
  );
}
