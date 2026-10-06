# Tasks — Aviso de pedidos pendientes con polling (US-07)

Rama `feature-us07-pending-badge-FJW`, sobre `main`.

## 1. Servidor

- [x] 1.1 `countPendingOrders()`: `count` de `Order` en `DRAFT`. Toca `src/core/orders/queries.ts`
- [x] 1.2 `GET /api/orders/pending-count` con `requireRole(STAFF)` como primera operación, `401` con `jsonError` y `200 { count }` sin caché. Toca `src/app/api/orders/pending-count/route.ts`

## 2. Interfaz

- [x] 2.1 Lógica pura del indicador: `parsePendingCount` y `nextBadgeState` (último valor conocido, marca de desactualizado, nunca cero por error). Toca `src/components/pendingBadgeState.ts`
- [x] 2.2 `PendingBadge`: consulta inmediata y cada 10 s con timeout, salta pestañas ocultas, `router.refresh()` en `/admin/orders` cuando cambia el número. Toca `src/components/PendingBadge.tsx`
- [x] 2.3 Montar el badge en la navegación del staff. Toca `src/app/(staff)/layout.tsx`

## 3. Tests

- [x] 3.1 Unitarios de la lógica: éxito, fallo con valor previo, fallo sin valor previo, cuerpo inválido, recuperación tras fallo. Toca `tests/unit/pending-badge.test.ts`
- [x] 3.2 Integración del endpoint: `200` con el conteo de borradores, `401` sin sesión y con sesión caducada sin consultar la base, dos sesiones que dejan de contar un pedido confirmado. Toca `tests/integration/pending-count.test.ts`
- [x] 3.3 E2E: el badge de la navegación sube en uno al llegar un pedido desde el simulador, sin recargar. Toca `tests/e2e/order-flow.spec.ts`
