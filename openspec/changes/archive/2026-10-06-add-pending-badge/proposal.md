## Why

El listado `/admin/orders` muestra cuántos pedidos esperan confirmación, pero el número sólo cambia al recargar la página. El empleado trabaja de pie y con las manos ocupadas: un pedido que entra por WhatsApp mientras atiende el mostrador pasa inadvertido hasta que alguien recarga. Es el último criterio pendiente de `US-07`.

## What Changes

- Nuevo endpoint autenticado `GET /api/orders/pending-count` que devuelve el número de pedidos en borrador. La sesión se comprueba antes de cualquier consulta.
- Nuevo componente cliente `PendingBadge` en la navegación del backoffice que consulta ese endpoint cada 10 s.
- Si una consulta falla, el indicador conserva el último valor conocido y lo marca como desactualizado; **nunca muestra cero por un error**.
- Cuando el número cambia y el empleado está en el listado, el listado se refresca solo.

### Impacto visible para el usuario

- **Empleado:** ve en la barra de navegación, desde cualquier pantalla del backoffice, cuántos pedidos esperan, y el número se actualiza sin recargar. Si la conexión falla, el número queda marcado como desactualizado en vez de engañar con un cero.
- **Dos empleados a la vez:** cuando uno confirma, el pedido deja de contarse para ambos en la siguiente actualización.
- **Cliente:** sin cambios.

### Fuera de alcance

- **Tiempo real (SSE, WebSockets) y notificaciones push o sonoras:** descartados en D13; el polling cubre el requisito.
- **Refresco automático del detalle de un pedido:** sólo se refresca el listado, para no interferir con una edición en curso.
- **Pantalla del local (`/dashboard`):** es otra historia.
- **Retirar el contador estático del listado:** se mantiene; el refresco lo deja al día.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Implementa la parte del Requirement *«Revisión con el mínimo número de acciones»* de `order-confirmation` (escenarios «Aparece un pedido nuevo», «El sistema no puede consultar los pendientes» y «Dos empleados sobre la misma lista»), ya especificada en `bootstrap-carnik`; el comportamiento no cambia, por eso el change declara `skip_specs`.

## Impact

- **API:** `GET /api/orders/pending-count` (nueva, sólo lectura), protegida con `requireRole(STAFF)`.
- **Código:** `src/core/orders/queries.ts` (conteo), `src/app/api/orders/pending-count/route.ts`, `src/components/PendingBadge.tsx` y su lógica pura `src/components/pendingBadgeState.ts`, una línea en `src/app/(staff)/layout.tsx`.
- **Datos:** sin migraciones. Lee `Order` (`count` por `status = DRAFT`).
- **Dependencias:** ninguna nueva.
