import { NextResponse } from "next/server";
import { confirmOrder } from "@/core/orders/confirm";
import { requireRole, STAFF, UnauthorizedError } from "@/lib/auth/guard";
import { jsonError } from "@/lib/http";
import { OrderIdSchema } from "@/lib/validation/orders";

export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  // Primero la sesión: sin ella no se consulta la base (§2.6 del readme).
  let user;
  try {
    user = await requireRole(STAFF);
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "UNAUTHENTICATED", "Sesión requerida");
    throw error;
  }

  const { orderId } = await params;
  if (!OrderIdSchema.safeParse(orderId).success) {
    return jsonError(400, "VALIDATION_ERROR", "Identificador de pedido no válido");
  }

  const result = await confirmOrder(orderId, user.userId);
  switch (result.kind) {
    case "not_found":
      return jsonError(404, "ORDER_NOT_FOUND", "Pedido no encontrado");
    case "insufficient_stock":
      return jsonError(409, "INSUFFICIENT_STOCK", "Una o más líneas superan las existencias disponibles", {
        lines: result.lines,
      });
    case "confirmed":
      return NextResponse.json({
        ...result.order,
        alreadyConfirmed: result.alreadyConfirmed,
        summaryMessage: result.summaryMessage,
      });
  }
}
