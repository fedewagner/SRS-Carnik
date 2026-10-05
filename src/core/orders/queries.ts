import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Consulta compartida del backoffice; el filtro de estado la reutiliza para otras vistas (D13). */
export function listOrders(status?: OrderStatus) {
  return db.order.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { customer: true, _count: { select: { items: true } } },
  });
}

export function getOrderDetail(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      confirmedBy: { select: { email: true } },
      items: { include: { product: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
}

export function listActiveProducts() {
  return db.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });
}
