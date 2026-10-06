## Context

`Product` se siembra (`prisma/seed.ts`) y sólo `confirmOrder` escribe `stockQuantity`, con un `updateMany` condicional que decrementa (`src/core/orders/confirm.ts`). `OrderItem.unitPriceCents` es una copia del precio tomada al crear la línea (`createDraft.ts`, `editLines.ts`), y `hasStockWarning` se guarda calculado. Las ediciones de borrador y la confirmación se serializan tomando el bloqueo de fila del `Order` con un `updateMany` condicional a `DRAFT` (`editDraft` en `editLines.ts`). No hay estado «entregado»: `OrderStatus` es `DRAFT | CONFIRMED`.

## Goals / Non-Goals

**Goals:** alta de producto, precio, ingreso y reajuste de existencias desde el backoffice; cada variación de existencias registrada; lo comprometido del día visible al reajustar.

**Non-Goals:** baja o edición de producto, historial de precios, estado de entrega, *upsell*. Ver proposal.

## Decisions

### D1 · Libro de movimientos en una tabla `StockMovement`, sin derivar el stock de él

Tabla nueva:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String cuid | PK |
| `productId` | FK → `Product` | índice (`productId`, `createdAt`) |
| `type` | enum `StockMovementType` | `INTAKE`, `COUNT_ADJUSTMENT`, `ORDER_CONFIRMED` |
| `previousQuantity`, `quantityDelta`, `resultingQuantity` | Decimal(10,3) | |
| `countedQuantity`, `committedQuantity` | Decimal(10,3), nullable | sólo `COUNT_ADJUSTMENT` |
| `reason` | String, nullable | obligatorio en `COUNT_ADJUSTMENT` (validado en servidor) |
| `userId` | FK → `User` | quién la originó; en `ORDER_CONFIRMED`, quien confirmó |
| `orderId` | FK → `Order`, nullable | sólo `ORDER_CONFIRMED` |
| `createdAt` | DateTime | sin `updatedAt`: el asiento no se edita |

`Product.stockQuantity` sigue siendo la fuente de verdad y el movimiento se inserta en la misma transacción que lo modifica.
*Trade-off:* dos fuentes que deben coincidir, a cambio de no tocar ninguna lectura existente (drafter, avisos, confirmación) ni sumar un `SUM` por producto en cada propuesta. El invariante «resultado del último movimiento = stock» se cubre con test de integración. El stock sembrado no tiene movimiento de origen; se acepta: el historial empieza con este cambio.

### D2 · Cada escritura de stock bloquea la fila del `Product` y lee el valor anterior

Para conocer `previousQuantity` sin carreras, toda escritura toma `SELECT … FOR UPDATE` sobre el `Product` (`tx.$queryRaw`) dentro de la transacción, calcula y escribe con `update`.

- **Ingreso:** `resulting = previous + delta`. Es un delta, así que no necesita versión del cliente.
- **Reajuste:** el formulario manda el `stockQuantity` que vio (`expectedQuantity`); si difiere del bloqueado → `STALE`. Es concurrencia optimista sobre el valor mismo, sin columna `version`.
- **Confirmación:** sustituye el `updateMany … gte` actual por lock + comprobación + `update` + `stockMovement.create` por línea, **ordenando las líneas por `productId`** para que dos confirmaciones con productos comunes no se bloqueen en cruz.

*Trade-off:* SQL crudo en un punto (el `FOR UPDATE`; Prisma no lo expone) y un cambio en `confirm.ts`, que es el nudo del flujo. Se mitiga con los tests existentes de `confirm-order.test.ts`, que deben seguir en verde sin cambios.

### D3 · El cambio de precio recalcula borradores bloqueándolos uno a uno

`changePrice(productId, cents)` en una transacción:
1. Busca los `orderId` distintos de `OrderItem` del producto con `order.status = DRAFT`, **ordenados por id**.
2. Para cada uno, `updateMany where { id, status: DRAFT }` (el mismo bloqueo que usan `editDraft` y `confirmOrder`). Si `count = 0`, otro lo confirmó entre medias: se salta.
3. Actualiza `unitPriceCents` y `lineTotalCents` (con `lineTotalCents()` de `pricing.ts`) de sus líneas de ese producto y recalcula `Order.totalCents`.
4. **Al final**, `update` de `Product.pricePerUnitCents`.

El orden importa: `confirmOrder` bloquea `Order` y luego `Product`; aquí también, así que no hay bloqueo cruzado. Una confirmación concurrente ve el precio viejo completo o el nuevo completo: satisface el escenario de borde del spec.
*Trade-off:* un borrador creado por el webhook justo durante esta transacción puede nacer con el precio viejo (lee el `Product` sin bloqueo). La ventana es de milisegundos y el borrador sigue editable; se acepta. La transacción toca N borradores; con el volumen de una carnicería (decenas como mucho) es irrelevante. No se notifica al cliente: el acuse no lleva importes (`src/core/messaging`), así que el cliente no vio el precio viejo.

### D4 · «Comprometido» = confirmado hoy en `Europe/Zurich`

Sin estado de entrega no se puede saber qué sigue físicamente en la cámara. Se aproxima con `SUM(OrderItem.quantity)` de `Order` `CONFIRMED` con `confirmedAt >= inicio del día en Zúrich`, calculado con `Intl.DateTimeFormat` sobre `Europe/Zurich` (sin dependencia nueva).
*Trade-off:* falla si un pedido de ayer se retira hoy, o uno de hoy ya se entregó antes del conteo. Se acepta porque el usuario ve la cifra y el disponible resultante **antes** de guardar, y puede posponer el conteo. Cuando exista `US-13` (cola de armado) con un estado de entregado, la consulta cambia a «confirmado y no entregado» sin tocar el resto.

### D5 · Recalcular `hasStockWarning` al variar existencias

Ingreso, reajuste y confirmación, **después de su commit**, actualizan `hasStockWarning = quantity > Product.stockQuantity` en los `OrderItem` del producto cuyos `Order` están en `DRAFT`: un único `UPDATE … FROM "Order", "Product"` con SQL crudo que lee el stock ya confirmado (`refreshDraftWarnings` en `src/core/catalog/stock.ts`).
*Trade-off:* hacerlo dentro de la transacción del stock retendría el bloqueo del `Product` mientras espera filas de `OrderItem` que un cambio de precio (D3) puede tener tomadas, y D3 a su vez espera el `Product`: bloqueo cruzado. Fuera de ella, el aviso queda desfasado unos milisegundos; es informativo, no transaccional (la suficiencia real se comprueba al confirmar), y como lee el valor vigente, dos recálculos en desorden convergen igual.

### D6 · Rutas, acciones y validación

| Ruta | Contenido |
|---|---|
| `/admin/products` | tabla del catálogo (D4 incluido) y, para `ADMIN`, formulario de alta |
| `/admin/products/[id]` | precio (sólo `ADMIN`), ingreso, reajuste con vista previa, historial |

Server actions en `src/app/(staff)/admin/products/actions.ts` y `…/[id]/actions.ts`: `requireRole` como primera línea (`["ADMIN"]` para alta y precio, `STAFF` para ingreso y reajuste), luego Zod en `src/lib/validation/catalog.ts`:
- precio: `^\d{1,5}([.,]\d{1,2})?$`, > 0, a céntimos;
- cantidad: reutiliza `QuantityInputSchema` y `isValidQuantity(unit, …)` de `pricing.ts`; el conteo admite 0;
- nombre: 2–60 caracteres; slug derivado con `normalize("NFD")` sin diacríticos, unicidad por `slug` (índice ya existente) → error `DUPLICATE`.

La vista previa del reajuste (contado − comprometido) se calcula en el cliente sólo para mostrarla; el servidor la recalcula siempre.
No hay rutas `/api` nuevas: todo son server actions, como en `US-08`. Enlace «Catálogo» en `src/app/(staff)/layout.tsx`.

### D7 · Variables de entorno

Ninguna nueva. La zona `Europe/Zurich` es constante de dominio en `src/core/catalog/committed.ts`, no configuración.

## Risks / Trade-offs

- **Tocar `confirmOrder`** (D2) el día anterior a la entrega → hacerlo en una tarea propia, con la suite de confirmación pasando antes de seguir.
- **Aproximación de lo comprometido** (D4) → documentada en pantalla con el texto «confirmado hoy».
- **Deadlocks** entre cambio de precio y confirmación → mismo orden de bloqueo (`Order` primero, por id; `Product` después, por id).

## Migration Plan

Una migración Prisma (`add_stock_movement`): enum + tabla + FKs. Sin backfill. Reversión: `migrate` de bajada eliminando la tabla; `confirm.ts` vuelve al commit anterior.
