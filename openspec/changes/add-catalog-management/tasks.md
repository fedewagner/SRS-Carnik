# Tasks — Gestión del catálogo (US-15)

Timebox ~3,5 h. Rama `feature-us15-catalog-FJW`.

## 1. Datos

- [x] 1.1 Enum `StockMovementType` y modelo `StockMovement` (D1) con relaciones a `Product`, `User` y `Order`; migración `add_stock_movement`; reiniciar la base de tests. Toca `prisma/schema.prisma`, `prisma/migrations/*_add_stock_movement/`, `tests/helpers/db.ts`

## 2. Dominio

- [x] 2.1 `committedToday(productIds)` con inicio de día en `Europe/Zurich` (D4) y `lockProduct(tx, id)` con `SELECT … FOR UPDATE` (D2). Toca `src/core/catalog/committed.ts`, `src/core/catalog/lock.ts`
- [x] 2.2 `registerIntake` y `adjustToCount` (STALE, conteo < comprometido, motivo obligatorio), cada uno con su `StockMovement` y el recálculo de `hasStockWarning` en borradores (D5). Toca `src/core/catalog/stock.ts`
- [x] 2.3 `createProduct` (slug sin acentos, `DUPLICATE`, `INTAKE` inicial si > 0) y `changePrice` con recálculo de borradores en el orden de bloqueo de D3. Toca `src/core/catalog/products.ts`
- [x] 2.4 `confirmOrder` registra `ORDER_CONFIRMED` por línea con producto, con bloqueo de `Product` en orden de `productId` (D2); `confirm-order.test.ts` debe seguir en verde sin cambios. Toca `src/core/orders/confirm.ts`

## 3. Interfaz

- [x] 3.1 Validación Zod de precio, cantidad, conteo, motivo y nombre (D6); server actions con `requireRole` como primera línea (`ADMIN` para alta y precio, `STAFF` para stock). Toca `src/lib/validation/catalog.ts`, `src/app/(staff)/admin/products/actions.ts`, `src/app/(staff)/admin/products/[id]/actions.ts`
- [x] 3.2 `/admin/products`: tabla con unidad, precio, disponible, comprometido hoy y señal de agotado; formulario de alta sólo para `ADMIN`; enlace «Catálogo» en la cabecera. Toca `src/app/(staff)/admin/products/page.tsx`, `src/components/NewProductForm.tsx`, `src/core/catalog/queries.ts`, `src/app/(staff)/layout.tsx`
- [x] 3.3 `/admin/products/[id]`: formulario de precio (`ADMIN`), ingreso, reajuste con vista previa contado − comprometido y aviso STALE con valores frescos, historial de movimientos. Toca `src/app/(staff)/admin/products/[id]/page.tsx`, `src/components/StockAdjustForm.tsx`, `src/components/StockIntakeForm.tsx`, `src/components/PriceForm.tsx`

## 4. Tests

- [x] 4.1 Integración de stock: ingreso suma y registra; ingreso concurrente con confirmación termina coherente; reajuste con comprometido, STALE, conteo < comprometido y sin motivo; aviso de borrador recalculado; confirmación revertida no deja movimientos; invariante último resultado = stock. Toca `tests/integration/catalog-stock.test.ts`
- [x] 4.2 Integración de catálogo: alta válida con `INTAKE`, datos inválidos, nombre duplicado con acentos; cambio de precio recalcula borrador y no toca confirmado; `EMPLOYEE` rechazado en alta y precio; sin sesión rechazado. Toca `tests/integration/catalog-products.test.ts`
- [x] 4.3 E2E: el `ADMIN` sube un precio, el borrador abierto muestra el total nuevo y se confirma; luego registra un ingreso y lo ve en el historial. Toca `tests/e2e/catalog.spec.ts`

## 5. Documentación

- [x] 5.1 README: `US-15` en §0 y en el backlog, `US-09` reemplazada, `US-16` (*upsell*) como Could; `StockMovement` en el modelo de datos. Toca `readme.md`
