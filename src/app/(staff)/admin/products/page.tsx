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
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Catálogo</h1>
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left text-stone-600">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">Precio</th>
              <th className="px-4 py-2 text-right">Disponible</th>
              <th className="px-4 py-2 text-right" title="Pedidos confirmados hoy, todavía en la cámara">Comprometido hoy</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50">
                <td className="px-4 py-2">
                  <Link href={`/admin/products/${p.id}`} className="text-red-800 hover:underline">{p.name}</Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2">{formatChf(p.pricePerUnitCents)} / {unitLabel(p.unit)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {p.stockQuantity.isZero() ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Agotado</span>
                  ) : (
                    formatStock(p.stockQuantity, p.unit)
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-stone-500">{formatStock(p.committed, p.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {user.role === "ADMIN" && <NewProductForm />}
    </section>
  );
}
