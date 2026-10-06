import { NextResponse } from "next/server";
import { countPendingOrders } from "@/core/orders/queries";
import { requireRole, STAFF, UnauthorizedError } from "@/lib/auth/guard";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Polling del badge de pendientes (D13). Sólo lectura: devuelve cuántos pedidos están en borrador. */
export async function GET() {
  // Primero la sesión: sin ella no se consulta la base (§2.6 del readme).
  try {
    await requireRole(STAFF);
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "UNAUTHENTICATED", "Sesión requerida");
    throw error;
  }

  const count = await countPendingOrders();
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
