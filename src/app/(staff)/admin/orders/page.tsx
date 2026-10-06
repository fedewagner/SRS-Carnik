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
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-subtitle">Revisá los borradores que llegan por WhatsApp y confirmalos.</p>
        </div>
        <span data-testid="pending-count" className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 ring-inset">
          {pending} por confirmar
        </span>
      </div>
      {orders.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="font-display text-lg font-semibold text-stone-800">Todavía no hay pedidos</p>
          <p className="max-w-sm text-sm text-stone-500">Enviá un mensaje desde el simulador para crear el primero.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref.</th>
                <th>Cliente</th>
                <th className="text-right">Líneas</th>
                <th className="text-right">Total</th>
                <th>Estado</th>
                <th>Recibido</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={`hover:bg-stone-50 ${o.status === "DRAFT" ? "bg-amber-50/30" : ""}`}>
                  <td className="font-mono font-semibold">
                    <Link href={`/admin/orders/${o.id}`} className="text-brand-700 hover:underline">{o.reference}</Link>
                  </td>
                  <td className="font-medium text-stone-800">{o.customer.profileName ?? o.customer.phoneE164}</td>
                  <td className="text-right text-stone-600">{o._count.items}</td>
                  <td className="text-right font-medium whitespace-nowrap">{formatChf(o.totalCents)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="whitespace-nowrap text-stone-500">{o.createdAt.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

