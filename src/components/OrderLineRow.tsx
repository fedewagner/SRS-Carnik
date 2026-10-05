"use client";

import { useActionState } from "react";
import {
  removeLineAction,
  resolveLineAction,
  updateLineAction,
  type LineActionState,
} from "@/app/(staff)/admin/orders/[id]/actions";

type Unit = "WEIGHT_KG" | "PIECE";

export type CatalogOption = { id: string; name: string; unit: Unit; stockQuantity: string };

export type OrderLineView = {
  id: string;
  rawText: string;
  quantity: string;
  unitPriceCents: number;
  lineTotalCents: number;
  hasStockWarning: boolean;
  product: { name: string; unit: Unit; stockQuantity: string } | null;
};

const chf = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;
const unitLabel = (unit?: Unit) => (unit === "PIECE" ? "u." : unit ? "kg" : "");
const inputClass = "w-16 rounded border border-stone-300 px-2 py-1";
const linkButton = "text-xs text-red-800 hover:underline disabled:opacity-50";

/**
 * Línea del detalle. En borrador: la cantidad se edita y la línea se elimina en el sitio (US-08),
 * y a una mención sin reconocer se le asigna un producto del catálogo.
 */
export function OrderLineRow({
  orderId,
  line,
  editable,
  products,
}: {
  orderId: string;
  line: OrderLineView;
  editable: boolean;
  products: CatalogOption[];
}) {
  const [updateState, update, updating] = useActionState<LineActionState, FormData>(updateLineAction, {});
  const [removeState, remove, removing] = useActionState<LineActionState, FormData>(removeLineAction, {});
  const [resolveState, resolve, resolving] = useActionState<LineActionState, FormData>(resolveLineAction, {});
  const error = updateState.error ?? removeState.error ?? resolveState.error;
  const ids = (
    <>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={line.id} />
    </>
  );

  return (
    <tr data-testid="order-line" className="border-t border-stone-100 align-top">
      <td className="px-4 py-2">
        {line.product ? (
          line.product.name
        ) : editable ? (
          <form action={resolve} className="flex flex-wrap items-center gap-1">
            {ids}
            <select
              name="productId"
              required
              defaultValue=""
              aria-label={`Producto para «${line.rawText}»`}
              className="rounded border border-amber-400 bg-amber-50 px-2 py-1"
            >
              <option value="" disabled>
                Elegir producto…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({unitLabel(p.unit)}) · {Number(p.stockQuantity)} disp.
                </option>
              ))}
            </select>
            <input
              name="quantity"
              defaultValue={Number(line.quantity)}
              aria-label={`Cantidad para «${line.rawText}»`}
              inputMode="decimal"
              className={inputClass}
            />
            <button disabled={resolving} className={linkButton}>
              {resolving ? "…" : "Asignar"}
            </button>
          </form>
        ) : (
          <span className="text-amber-700">Sin reconocer</span>
        )}
        <div className="text-xs text-stone-500">“{line.rawText}”</div>
        {line.hasStockWarning && editable && line.product && (
          <div className="text-xs font-medium text-red-700">Supera el stock disponible</div>
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
            {ids}
            <input
              name="quantity"
              defaultValue={Number(line.quantity)}
              aria-label={`Cantidad de ${line.product.name}`}
              inputMode="decimal"
              className={inputClass}
            />
            <span className="text-stone-500">{unitLabel(line.product.unit)}</span>
            <button disabled={updating} className={linkButton}>
              {updating ? "…" : "Guardar"}
            </button>
          </form>
        ) : line.product ? (
          <>
            {Number(line.quantity)} {unitLabel(line.product.unit)}
          </>
        ) : (
          <span className="text-stone-400">—</span>
        )}
      </td>
      <td
        data-testid="line-stock"
        className={`whitespace-nowrap px-4 py-2 ${line.hasStockWarning && editable ? "font-medium text-red-700" : "text-stone-600"}`}
      >
        {line.product ? `${Number(line.product.stockQuantity)} ${unitLabel(line.product.unit)}` : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-2">{line.product ? chf(line.unitPriceCents) : "—"}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        {chf(line.lineTotalCents)}
        {editable && (
          <form action={remove}>
            {ids}
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
