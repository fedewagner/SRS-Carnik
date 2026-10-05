import { NextResponse } from "next/server";
import { ingestInboundMessage } from "@/core/messaging/ingest";
import { requireRole, STAFF, UnauthorizedError } from "@/lib/auth/guard";
import { jsonError } from "@/lib/http";
import { SimulatedMessageSchema } from "@/lib/validation/messaging";

export async function POST(req: Request) {
  // 404 y no 403 con el canal apagado: no se revela que existe (§4 del readme).
  if (process.env.SIMULATOR_ENABLED !== "true") return jsonError(404, "NOT_FOUND", "No encontrado");
  try {
    await requireRole(STAFF);
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "UNAUTHENTICATED", "Sesión requerida");
    throw error;
  }

  const body = await req.json().catch(() => null);
  const parsed = SimulatedMessageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "Datos no válidos", { issues: parsed.error.issues });
  }

  const result = await ingestInboundMessage({ ...parsed.data, channel: "SIMULATOR" });
  if (result.status === "duplicate" || result.status === "unsupported") {
    return NextResponse.json({ duplicate: result.status === "duplicate", order: null });
  }
  if (result.status === "appended") {
    return NextResponse.json({ messageId: result.messageId, appendedToOrderId: result.openOrderId, order: null });
  }

  const { order } = result;
  return NextResponse.json({
    messageId: result.messageId,
    order: {
      id: order.id,
      reference: order.reference,
      status: order.status,
      draftedBy: order.draftedBy,
      totalCents: order.totalCents,
      currency: "CHF",
      items: order.items.map((i) => ({
        id: i.id,
        product: i.product && { id: i.product.id, slug: i.product.slug, name: i.product.name, unit: i.product.unit },
        rawText: i.rawText,
        quantity: i.quantity.toFixed(3),
        unitPriceCents: i.unitPriceCents,
        lineTotalCents: i.lineTotalCents,
        hasStockWarning: i.hasStockWarning,
        availableQuantity: i.hasStockWarning && i.product ? i.product.stockQuantity.toFixed(3) : null,
      })),
    },
  });
}
