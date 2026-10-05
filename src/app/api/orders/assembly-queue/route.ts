import { NextResponse } from "next/server";
import { getAssemblyQueue } from "@/core/orders/assemblyQueue";
import { requireRole, STAFF, UnauthorizedError } from "@/lib/auth/guard";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Refresco de la cola de armado (US-13). No lee parámetros: el corte del día lo fija el servidor. */
export async function GET() {
  // Primero la sesión: sin ella no se consulta la base (§2.6 del readme).
  try {
    await requireRole(STAFF);
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "UNAUTHENTICATED", "Sesión requerida");
    throw error;
  }

  return NextResponse.json(await getAssemblyQueue(), { headers: { "Cache-Control": "no-store" } });
}
