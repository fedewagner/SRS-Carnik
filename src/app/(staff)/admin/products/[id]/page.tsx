import Link from "next/link";
import { notFound } from "next/navigation";
import type { StockMovementType } from "@prisma/client";
import { getProductDetail } from "@/core/catalog/queries";
import { formatChf } from "@/core/orders/pricing";
import { PriceForm } from "@/components/PriceForm";
import { StockAdjustForm } from "@/components/StockAdjustForm";
import { StockIntakeForm } from "@/components/StockIntakeForm";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";
import { formatStock, unitLabel } from "../format";

export const dynamic = "force-dynamic";

const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  INTAKE: "Ingreso",
  COUNT_ADJUSTMENT: "Reajuste",
  ORDER_CONFIRMED: "Pedido confirmado",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoleOrRedirect(STAFF);
  const product = await getProductDetail((await params).id);
  if (!product) notFound();
  const unit = unitLabel(product.unit);

  return (
    <section className="space-y-4">
      <div>
        <Link href="/admin/products" className="text-sm text-stone-500 hover:underline">← Catálogo</Link>
        <h1 className="text-xl font-bold">{product.name}</h1>
        <p className="text-sm text-stone-600">
          {formatChf(product.pricePerUnitCents)} / {unit} · {formatStock(product.stockQuantity, product.unit)} disponibles
        </p>
      </div>

      {user.role === "ADMIN" && (
        <PriceForm productId={product.id} currentCents={product.pricePerUnitCents} unitLabel={unit} />
      )}
      <StockIntakeForm productId={product.id} unitLabel={unit} />
      <StockAdjustForm
        productId={product.id}
        unitLabel={unit}
        stock={product.stockQuantity.toFixed(3)}
        committed={product.committed.toFixed(3)}
      />

      <div>
        <h2 className="mb-2 font-semibold">Movimientos de existencias</h2>
        {product.stockMovements.length === 0 ? (
          <p className="rounded-lg bg-white p-4 text-sm text-stone-500">Sin movimientos registrados todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-sm" data-testid="movements">
              <thead className="bg-stone-100 text-left text-stone-600">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2 text-right">Anterior</th>
                  <th className="px-4 py-2 text-right">Variación</th>
                  <th className="px-4 py-2 text-right">Resultado</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {product.stockMovements.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100">
                    <td className="whitespace-nowrap px-4 py-2 text-stone-500">
                      {m.createdAt.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })}
                    </td>
                    <td className="px-4 py-2">{MOVEMENT_LABEL[m.type]}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">{formatStock(m.previousQuantity, product.unit)}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right ${m.quantityDelta.isNegative() ? "text-red-700" : "text-green-700"}`}>
                      {m.quantityDelta.isNegative() ? "" : "+"}{formatStock(m.quantityDelta, product.unit)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">{formatStock(m.resultingQuantity, product.unit)}</td>
                    <td className="px-4 py-2 text-stone-600">
                      {m.order && (
                        <Link href={`/admin/orders/${m.order.id}`} className="font-mono text-red-800 hover:underline">{m.order.reference}</Link>
                      )}
                      {m.type === "COUNT_ADJUSTMENT" && (
                        <>
                          Contado {formatStock(m.countedQuantity!, product.unit)}, comprometido{" "}
                          {formatStock(m.committedQuantity!, product.unit)} · {m.reason}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-stone-500">{m.user.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
