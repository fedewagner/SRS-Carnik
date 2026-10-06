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
    <section className="space-y-5">
      <div className="space-y-2">
        <Link href="/admin/products" className="back-link">← Catálogo</Link>
        <h1 className="page-title">{product.name}</h1>
        <p className="text-sm text-stone-600 tabular-nums">
          {formatChf(product.pricePerUnitCents)} / {unit} · {formatStock(product.stockQuantity, product.unit)} disponibles
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
      {user.role === "ADMIN" && (
        <PriceForm productId={product.id} currentCents={product.pricePerUnitCents} unitLabel={unit} />
      )}
      <StockIntakeForm productId={product.id} unitLabel={unit} />
      </div>
      <StockAdjustForm
        productId={product.id}
        unitLabel={unit}
        stock={product.stockQuantity.toFixed(3)}
        committed={product.committed.toFixed(3)}
      />

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-stone-900">Movimientos de existencias</h2>
        {product.stockMovements.length === 0 ? (
          <p className="card p-6 text-center text-sm text-stone-500">Sin movimientos registrados todavía.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table" data-testid="movements">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="text-right">Anterior</th>
                  <th className="text-right">Variación</th>
                  <th className="text-right">Resultado</th>
                  <th>Detalle</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {product.stockMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-stone-500">
                      {m.createdAt.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })}
                    </td>
                    <td>{MOVEMENT_LABEL[m.type]}</td>
                    <td className="whitespace-nowrap text-right">{formatStock(m.previousQuantity, product.unit)}</td>
                    <td className={`whitespace-nowrap text-right ${m.quantityDelta.isNegative() ? "text-red-700" : "text-green-700"}`}>
                      {m.quantityDelta.isNegative() ? "" : "+"}{formatStock(m.quantityDelta, product.unit)}
                    </td>
                    <td className="whitespace-nowrap text-right">{formatStock(m.resultingQuantity, product.unit)}</td>
                    <td className="text-stone-600">
                      {m.order && (
                        <Link href={`/admin/orders/${m.order.id}`} className="font-mono font-medium text-brand-700 hover:underline">{m.order.reference}</Link>
                      )}
                      {m.type === "COUNT_ADJUSTMENT" && (
                        <>
                          Contado {formatStock(m.countedQuantity!, product.unit)}, comprometido{" "}
                          {formatStock(m.committedQuantity!, product.unit)} · {m.reason}
                        </>
                      )}
                    </td>
                    <td className="text-stone-500">{m.user.email}</td>
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
