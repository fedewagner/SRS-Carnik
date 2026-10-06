"use client";

import { useActionState } from "react";
import { addLineAction, type LineActionState } from "@/app/(staff)/admin/orders/[id]/actions";

import type { CatalogOption } from "./OrderLineRow";

/** Alta de una línea con un producto activo del catálogo. El precio lo pone el servidor. */
export function AddLineForm({ orderId, products }: { orderId: string; products: CatalogOption[] }) {
  const [state, action, pending] = useActionState<LineActionState, FormData>(addLineAction, {});
  return (
    <form action={action} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
      <input type="hidden" name="orderId" value={orderId} />
      <span className="card-title mr-1">Añadir línea</span>
      <select name="productId" aria-label="Producto" required className="input min-w-0 flex-1">
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.unit === "PIECE" ? "u." : "kg"}) · {Number(p.stockQuantity)} disp.
          </option>
        ))}
      </select>
      <input name="quantity" aria-label="Cantidad a añadir" required inputMode="decimal" placeholder="1"
        className="input w-20" />
      <button disabled={pending} className="btn-secondary">
        {pending ? "Añadiendo…" : "Añadir"}
      </button>
      {state.error && <span role="status" className="text-error w-full">{state.error}</span>}
    </form>
  );
}
