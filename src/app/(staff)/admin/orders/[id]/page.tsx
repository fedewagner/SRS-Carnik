import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLineForm } from "@/components/AddLineForm";
import { ConfirmOrderButton } from "@/components/ConfirmOrderButton";
import { OrderLineRow } from "@/components/OrderLineRow";
import { StatusBadge } from "@/components/StatusBadge";
import { formatChf } from "@/core/orders/pricing";
import { getOrderDetail, listActiveProducts } from "@/core/orders/queries";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";
import { OrderIdSchema } from "@/lib/validation/orders";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRoleOrRedirect(STAFF);
  const { id } = await params;
  if (!OrderIdSchema.safeParse(id).success) notFound();
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const resolvedLines = order.items.filter((i) => i.productId).length;
  const editable = order.status === "DRAFT";
  // Decimal no cruza al cliente: se pasa como texto.
  const products = editable
    ? (await listActiveProducts()).map((p) => ({ ...p, stockQuantity: p.stockQuantity.toString() }))
    : [];

  return (
    <section className="grid gap-6 md:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <Link href="/admin/orders" className="text-sm text-stone-500 hover:underline">← Pedidos</Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-bold">{order.reference}</h1>
          <StatusBadge status={order.status} />
          <span className="text-sm text-stone-500">
            {order.customer.profileName ?? "Cliente"} · {order.customer.phoneE164} ·{" "}
            {order.draftedBy === "AI" ? "interpretado con AI" : "interpretado por reglas"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left text-stone-600">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Cantidad</th>
                <th className="px-4 py-2" title="Existencias actuales, ya descontados los pedidos confirmados">Stock disponible</th>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <OrderLineRow
                  key={item.id}
                  orderId={order.id}
                  editable={editable}
                  products={products}
                  line={{
                    id: item.id,
                    rawText: item.rawText,
                    quantity: item.quantity.toString(),
                    unitPriceCents: item.unitPriceCents,
                    lineTotalCents: item.lineTotalCents,
                    hasStockWarning: item.hasStockWarning,
                    product: item.product && {
                      name: item.product.name,
                      unit: item.product.unit,
                      stockQuantity: item.product.stockQuantity.toString(),
                    },
                  }}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 font-bold">
                <td className="px-4 py-2" colSpan={4}>Total</td>
                <td data-testid="order-total" className="px-4 py-2 text-right">{formatChf(order.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {editable && <AddLineForm orderId={order.id} products={products} />}

        {order.status === "DRAFT" ? (
          <ConfirmOrderButton orderId={order.id} hasLines={resolvedLines > 0} />
        ) : (
          <p className="text-sm text-green-800">
            Confirmado el {order.confirmedAt?.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })} por {order.confirmedBy?.email}.
          </p>
        )}
      </div>

      <aside className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Conversación</h2>
        <ol className="space-y-2">
          {order.conversation.messages.map((m) => (
            <li
              key={m.id}
              data-testid={`message-${m.direction.toLowerCase()}`}
              className={`whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                m.direction === "INBOUND" ? "mr-8 bg-stone-100" : "ml-8 bg-green-100"
              }`}
            >
              {m.body}
              <div className="mt-1 text-[10px] text-stone-500">
                {m.createdAt.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })}
                {m.direction === "OUTBOUND" && ` · ${m.status === "SENT" ? "enviado" : "falló"}`}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
