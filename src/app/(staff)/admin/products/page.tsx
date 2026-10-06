import Link from "next/link";
import { listCatalog } from "@/core/catalog/queries";
import { formatChf } from "@/core/orders/pricing";
import { NewProductForm } from "@/components/NewProductForm";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";
import { formatStock, unitLabel } from "./format";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requireRoleOrRedirect(STAFF);
  const products = await listCatalog();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="page-title">Catálogo</h1>
        <p className="page-subtitle">Precios y existencias que usa Carnik para interpretar y valorar los pedidos.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio</th>
              <th className="text-right">Disponible</th>
              <th className="text-right" title="Pedidos confirmados hoy, todavía en la cámara">Comprometido hoy</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50">
                <td>
                  <Link href={`/admin/products/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                </td>
                <td className="whitespace-nowrap text-stone-600">{formatChf(p.pricePerUnitCents)} / {unitLabel(p.unit)}</td>
                <td className="whitespace-nowrap text-right font-medium">
                  {p.stockQuantity.isZero() ? (
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 ring-inset">Agotado</span>
                  ) : (
                    formatStock(p.stockQuantity, p.unit)
                  )}
                </td>
                <td className="whitespace-nowrap text-right text-stone-500">{formatStock(p.committed, p.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {user.role === "ADMIN" && <NewProductForm />}
    </section>
  );
}
