import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmOrderButton } from "@/components/ConfirmOrderButton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatChf } from "@/core/orders/pricing";
import { getOrderDetail } from "@/core/orders/queries";
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
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} data-testid="order-line" className="border-t border-stone-100 align-top">
                  <td className="px-4 py-2">
                    {item.product ? item.product.name : <span className="text-amber-700">Sin reconocer</span>}
                    <div className="text-xs text-stone-500">“{item.rawText}”</div>
                    {item.hasStockWarning && order.status === "DRAFT" && item.product && (
                      <div className="text-xs font-medium text-red-700">
                        Supera lo disponible ({Number(item.product.stockQuantity)}{" "}
                        {item.product.unit === "PIECE" ? "u." : "kg"})
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {Number(item.quantity)} {item.product?.unit === "PIECE" ? "u." : item.product ? "kg" : ""}
                  </td>
                  <td className="px-4 py-2">{item.product ? formatChf(item.unitPriceCents) : "—"}</td>
                  <td className="px-4 py-2 text-right">{formatChf(item.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200 font-bold">
                <td className="px-4 py-2" colSpan={3}>Total</td>
                <td data-testid="order-total" className="px-4 py-2 text-right">{formatChf(order.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

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
