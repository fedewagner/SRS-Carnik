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
const inputClass = "input w-20 px-2 py-1";
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
    <tr data-testid="order-line" className={`align-top ${line.product ? "" : "bg-amber-50/50"}`}>
      <td>
        {line.product ? (
          <span className="font-medium text-stone-900">{line.product.name}</span>
        ) : editable ? (
          <form action={resolve} className="flex flex-wrap items-center gap-1">
            {ids}
            <select
              name="productId"
              required
              defaultValue=""
              aria-label={`Producto para «${line.rawText}»`}
              className="input border-amber-400 bg-amber-50 px-2 py-1"
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
          <span className="font-medium text-amber-700">Sin reconocer</span>
        )}
        <div className="mt-0.5 text-xs text-stone-500 italic">“{line.rawText}”</div>
        {line.hasStockWarning && editable && line.product && (
          <div className="mt-1 inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Supera el stock disponible</div>
        )}
        {error && (
          <div role="status" className="text-xs font-medium text-red-700">
            {error}
          </div>
        )}
      </td>
      <td>
        {editable && line.product ? (
          <form action={update} className="flex items-center gap-1.5">
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
        className={`whitespace-nowrap ${line.hasStockWarning && editable ? "font-medium text-red-700" : "text-stone-600"}`}
      >
        {line.product ? `${Number(line.product.stockQuantity)} ${unitLabel(line.product.unit)}` : "—"}
      </td>
      <td className="whitespace-nowrap text-stone-600">{line.product ? chf(line.unitPriceCents) : "—"}</td>
      <td className="whitespace-nowrap text-right">
        <span className="font-medium">{chf(line.lineTotalCents)}</span>
        {editable && (
          <form action={remove}>
            {ids}
            <button
              disabled={removing}
              aria-label={`Eliminar ${line.product?.name ?? "línea sin reconocer"}`}
              className="mt-1 text-xs text-stone-400 transition-colors hover:text-red-700 hover:underline disabled:opacity-50"
            >
              Eliminar
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
