# Tasks — Ajuste de líneas del borrador (US-08)

Timebox ~1 h. Rama `feature-us08-FJW`, apilada sobre `feature-whatsapp-twilio-FJW`.

## 1. Dominio

- [x] 1.1 `src/core/orders/editLines.ts`: `updateLineQuantity`, `removeLine` y `addLine`, cada una en una transacción que primero bloquea el `Order` con un `updateMany` condicional a `DRAFT` (rechazo si no lo está), valida la cantidad contra la unidad del producto (`isValidQuantity`), recalcula `lineTotalCents` y `hasStockWarning` contra la base y recalcula `Order.totalCents`. Toca `src/core/orders/editLines.ts`
- [x] 1.2 Serializar `confirmOrder` con las ediciones: su primer paso ya es el `updateMany` condicional sobre el mismo `Order`; verificar que ninguna edición pueda colarse entre la lectura de líneas y el descuento, releyendo las líneas dentro de la transacción. Toca `src/core/orders/confirm.ts`

## 2. Interfaz

- [x] 2.1 Server actions con `requireRole` como primera línea y validación Zod del `orderId`, `itemId`, `productId` y la cantidad (coma decimal admitida). Toca `src/app/(staff)/admin/orders/[id]/actions.ts`, `src/lib/validation/orders.ts`
- [x] 2.2 `OrderLineRow` (cantidad editable + eliminar, con error junto a la línea) y `AddLineForm` (producto activo del catálogo + cantidad), visibles sólo en borrador; el detalle los usa. Toca `src/components/OrderLineRow.tsx`, `src/components/AddLineForm.tsx`, `src/app/(staff)/admin/orders/[id]/page.tsx`, `src/core/orders/queries.ts`

## 3. Tests

- [x] 3.1 Integración: ajuste de cantidad recalcula importe, total y aviso; cantidad inválida (cero, negativa, fraccionaria en piezas) rechazada sin cambios; edición, alta y baja sobre un pedido confirmado rechazadas; añadir y eliminar línea recalculan el total; server action sin sesión rechazada. Toca `tests/integration/edit-lines.test.ts`
- [x] 3.2 E2E: el flujo principal ajusta la cantidad de una línea antes de confirmar y verifica el total y el descuento con la cantidad corregida. Toca `tests/e2e/order-flow.spec.ts`

## 4. Ampliación pedida en revisión

- [x] 4.1 `resolveLine`: asignar producto y cantidad a una línea sin reconocer, con el mismo bloqueo y recálculo; rechaza líneas ya resueltas. Toca `src/core/orders/editLines.ts`, `src/lib/validation/orders.ts`, `src/app/(staff)/admin/orders/[id]/actions.ts`
- [x] 4.2 Desplegable de productos con stock en la línea sin reconocer y columna «Stock disponible» en el detalle. Toca `src/components/OrderLineRow.tsx`, `src/components/AddLineForm.tsx`, `src/app/(staff)/admin/orders/[id]/page.tsx`, `src/core/orders/queries.ts`
- [x] 4.3 Tests: asignación que valora y conserva el texto, reasignación rechazada; el E2E asigna un producto a «1 kg de cordero». Toca `tests/integration/edit-lines.test.ts`, `tests/e2e/order-flow.spec.ts`
