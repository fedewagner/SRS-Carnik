"use client";

import { useActionState } from "react";
import { removeLineAction, updateLineAction, type LineActionState } from "@/app/(staff)/admin/orders/[id]/actions";

export type OrderLineView = {
  id: string;
  rawText: string;
  quantity: string;
  unitPriceCents: number;
  lineTotalCents: number;
  hasStockWarning: boolean;
  product: { name: string; unit: "WEIGHT_KG" | "PIECE"; stockQuantity: string } | null;
};

const chf = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;
const unitLabel = (unit?: "WEIGHT_KG" | "PIECE") => (unit === "PIECE" ? "u." : unit ? "kg" : "");

/** Línea del detalle. En borrador, la cantidad se edita y la línea se elimina en el sitio (US-08). */
export function OrderLineRow({ orderId, line, editable }: { orderId: string; line: OrderLineView; editable: boolean }) {
  const [updateState, update, updating] = useActionState<LineActionState, FormData>(updateLineAction, {});
  const [removeState, remove, removing] = useActionState<LineActionState, FormData>(removeLineAction, {});
  const error = updateState.error ?? removeState.error;

  return (
    <tr data-testid="order-line" className="border-t border-stone-100 align-top">
      <td className="px-4 py-2">
        {line.product ? line.product.name : <span className="text-amber-700">Sin reconocer</span>}
        <div className="text-xs text-stone-500">“{line.rawText}”</div>
        {line.hasStockWarning && editable && line.product && (
          <div className="text-xs font-medium text-red-700">
            Supera lo disponible ({Number(line.product.stockQuantity)} {unitLabel(line.product.unit)})
          </div>
        )}
        {error && (
          <div role="status" className="text-xs font-medium text-red-700">
            {error}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        {editable && line.product ? (
          <form action={update} className="flex items-center gap-1">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="itemId" value={line.id} />
            <input
              name="quantity"
              defaultValue={Number(line.quantity)}
              aria-label={`Cantidad de ${line.product.name}`}
              inputMode="decimal"
              className="w-16 rounded border border-stone-300 px-2 py-1"
            />
            <span className="text-stone-500">{unitLabel(line.product.unit)}</span>
            <button disabled={updating} className="text-xs text-red-800 hover:underline disabled:opacity-50">
              {updating ? "…" : "Guardar"}
            </button>
          </form>
        ) : (
          <>
            {Number(line.quantity)} {unitLabel(line.product?.unit)}
          </>
        )}
      </td>
      <td className="px-4 py-2">{line.product ? chf(line.unitPriceCents) : "—"}</td>
      <td className="px-4 py-2 text-right">
        {chf(line.lineTotalCents)}
        {editable && (
          <form action={remove}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="itemId" value={line.id} />
            <button
              disabled={removing}
              aria-label={`Eliminar ${line.product?.name ?? "línea sin reconocer"}`}
              className="text-xs text-stone-500 hover:text-red-700 hover:underline disabled:opacity-50"
            >
              Eliminar
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
