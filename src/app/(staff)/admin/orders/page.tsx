import Link from "next/link";
import { listOrders } from "@/core/orders/queries";
import { formatChf } from "@/core/orders/pricing";
import { StatusBadge } from "@/components/StatusBadge";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireRoleOrRedirect(STAFF);
  const orders = await listOrders();
  const pending = orders.filter((o) => o.status === "DRAFT").length;

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-bold">Pedidos</h1>
        <span data-testid="pending-count" className="rounded-full bg-red-800 px-2 py-0.5 text-xs font-medium text-white">
          {pending} por confirmar
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-stone-500">
          Todavía no hay pedidos. Enviá un mensaje desde el simulador para crear el primero.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left text-stone-600">
              <tr>
                <th className="px-4 py-2">Ref.</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Líneas</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Recibido</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/admin/orders/${o.id}`} className="text-red-800 hover:underline">{o.reference}</Link>
                  </td>
                  <td className="px-4 py-2">{o.customer.profileName ?? o.customer.phoneE164}</td>
                  <td className="px-4 py-2">{o._count.items}</td>
                  <td className="px-4 py-2">{formatChf(o.totalCents)}</td>
                  <td className="px-4 py-2"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-2 text-stone-500">{o.createdAt.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

