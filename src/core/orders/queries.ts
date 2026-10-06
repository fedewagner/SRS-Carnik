import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type OrderListFilter = { status?: OrderStatus; confirmedSince?: Date };

/** Filtro compartido por el listado del backoffice y la cola de armado (D13). */
export function orderListWhere({ status, confirmedSince }: OrderListFilter): Prisma.OrderWhereInput {
  return {
    ...(status && { status }),
    ...(confirmedSince && { confirmedAt: { gte: confirmedSince } }),
  };
}

/** Consulta compartida del backoffice; el filtro de estado la reutiliza para otras vistas (D13). */
export function listOrders(status?: OrderStatus) {
  return db.order.findMany({
    where: orderListWhere({ status }),
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { customer: true, _count: { select: { items: true } } },
  });
}

/**
 * Cola de armado: el mismo filtro con estado CONFIRMED y una proyección cerrada en la base.
 * El `select` no pide teléfono, conversación ni texto del cliente: no salen de PostgreSQL.
 */
export function listAssemblyQueue(confirmedSince: Date) {
  return db.order.findMany({
    where: orderListWhere({ status: "CONFIRMED", confirmedSince }),
    orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      reference: true,
      confirmedAt: true,
      customer: { select: { profileName: true } },
      // Sólo las líneas con producto: son las que descontaron existencias y las que vio el cliente.
      items: {
        where: { productId: { not: null } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, quantity: true, product: { select: { name: true, unit: true } } },
      },
    },
  });
}

/** Pedidos que esperan confirmación; lo consulta el badge de la navegación cada 10 s (D13). */
export function countPendingOrders() {
  return db.order.count({ where: { status: "DRAFT" } });
}

export function getOrderDetail(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      confirmedBy: { select: { email: true } },
      items: { include: { product: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      conversation: {
        include: { messages: { orderBy: { createdAt: "asc" }, include: { sentBy: { select: { email: true } } } } },
      },
    },
  });
}

export function listActiveProducts() {
  return db.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, stockQuantity: true },
  });
}
