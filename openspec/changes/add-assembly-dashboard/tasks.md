# Tasks — Cola de armado en la pantalla del local (US-13)

Rama `feature-us13-dashboard-FJW`, en el worktree `../SRS-Carnik-us13`.

## 1. Consulta y proyección

- [x] 1.1 Extraer el filtro a `orderListWhere` y añadir `listAssemblyQueue(since)` con `select` sin teléfono, conversación ni `rawText`. Toca `src/core/orders/queries.ts`
- [x] 1.2 Inicio del día en `Europe/Zurich`, nombre de pila, hora y cantidades; `getAssemblyQueue(now)`. Toca `src/core/orders/assemblyQueue.ts`

## 2. Endpoint y vista

- [x] 2.1 `GET /api/orders/assembly-queue` con `requireRole(STAFF)` como primera línea y 401 sin sesión. Toca `src/app/api/orders/assembly-queue/route.ts`
- [x] 2.2 Componente cliente con polling cada 20 s, aviso de datos desactualizados que conserva la última lista y estado vacío explícito. Toca `src/components/AssemblyQueue.tsx`, `src/components/assemblyQueueState.ts`
- [x] 2.3 Página `/dashboard` con `requireRoleOrRedirect(STAFF)` y primera carga en el servidor. Toca `src/app/(staff)/dashboard/page.tsx`
- [x] 2.4 Enlace «Cola de armado» en la navegación del staff. Toca `src/app/(staff)/layout.tsx`

## 3. Tests

- [x] 3.1 Unitarios: inicio del día en Zurich (horario de invierno y de verano), nombre de pila y «Cliente», formato de cantidades. Toca `tests/unit/assembly-queue.test.ts`
- [x] 3.2 Integración: pedido confirmado aparece con líneas, cantidades y hora; sin teléfono ni conversación en la respuesta; borradores y confirmados de ayer excluidos; orden por confirmación; cola vacía; menciones sin producto omitidas; 401 sin sesión sin tocar la base y redirección de la página. Toca `tests/integration/assembly-queue.test.ts`
- [x] 3.3 Fallo del refresco: la lógica de refresco del componente conserva los pedidos y muestra el aviso, sin estado vacío. Toca `tests/unit/assembly-queue.test.ts`
- [x] 3.4 E2E: tras confirmar, el pedido aparece en `/dashboard` sin el teléfono. Toca `tests/e2e/order-flow.spec.ts`
