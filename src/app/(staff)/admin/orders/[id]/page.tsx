import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLineForm } from "@/components/AddLineForm";
import { ConfirmOrderButton } from "@/components/ConfirmOrderButton";
import { ManualMessageForm } from "@/components/ManualMessageForm";
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
    <section className="space-y-6">
      <Link href="/admin/orders" className="back-link">← Pedidos</Link>
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-bold tracking-tight text-stone-900">{order.reference}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
            <span className="font-medium text-stone-800">{order.customer.profileName ?? "Cliente"}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{order.customer.phoneE164}</span>
            <span aria-hidden>·</span>
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-600">
              {order.draftedBy === "AI" ? "interpretado con AI" : "interpretado por reglas"}
            </span>
          </p>
        </div>

        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th title="Existencias actuales, ya descontados los pedidos confirmados">Stock disponible</th>
                <th>Precio</th>
                <th className="text-right">Importe</th>
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
              <tr className="border-t border-line bg-stone-50/70">
                <td className="px-4 py-3 text-sm font-semibold text-stone-600" colSpan={4}>Total</td>
                <td data-testid="order-total" className="px-4 py-3 text-right text-lg font-bold whitespace-nowrap tabular-nums text-stone-900">{formatChf(order.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {editable && <AddLineForm orderId={order.id} products={products} />}

        {order.status === "DRAFT" ? (
          <ConfirmOrderButton orderId={order.id} hasLines={resolvedLines > 0} />
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span aria-hidden>✓</span>
            Confirmado el {order.confirmedAt?.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })} por {order.confirmedBy?.email}.
          </p>
        )}
      </div>

      <aside className="card overflow-hidden lg:sticky lg:top-20">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="card-title">Conversación</h2>
          <span className="text-xs text-stone-500">WhatsApp</span>
        </div>
        <ol className="max-h-[28rem] space-y-2 overflow-y-auto bg-[#efe9e1] px-3 py-4">
          {order.conversation.messages.map((m) => (
            <li
              key={m.id}
              data-testid={`message-${m.direction.toLowerCase()}`}
              className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line shadow-sm ${
                m.direction === "INBOUND" ? "mr-auto rounded-tl-sm bg-white" : "ml-auto rounded-tr-sm bg-[#d9fdd3]"
              }`}
            >
              {m.body}
              <div className="mt-1 text-right text-[10px] text-stone-500">
                {m.createdAt.toLocaleString("es-CH", { timeZone: "Europe/Zurich" })}
                {m.direction === "OUTBOUND" && (
                  <span className={m.status === "SENT" ? "" : "font-semibold text-red-700"}>
                    {` · ${m.status === "SENT" ? "enviado" : "falló"}`}
                  </span>
                )}
                {m.sentBy && <span data-testid="message-author"> · por {m.sentBy.email}</span>}
              </div>
            </li>
          ))}
        </ol>
        <div className="border-t border-line px-4 pb-4">
          <ManualMessageForm orderId={order.id} />
        </div>
      </aside>
      </div>
    </section>
  );
}
