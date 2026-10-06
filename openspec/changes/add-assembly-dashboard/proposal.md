## Why

Hoy un pedido confirmado sólo existe en el backoffice: quien arma los pedidos en el obrador tiene que acercarse a una pantalla de escritorio, entrar al listado y abrir cada detalle. El flujo E2E termina con «el pedido aparece en la pantalla del local para su armado», y esa última pieza falta (`US-13`).

## What Changes

- Nueva página **`/dashboard`**, pensada para una pantalla fija en el obrador: lista los pedidos **confirmados hoy** (día calendario en `Europe/Zurich`), del más antiguo al más reciente, con la **referencia en grande**, las **líneas con sus cantidades**, la **hora de confirmación** y el **nombre de pila** del cliente o «Cliente».
- La vista se **actualiza sola** cada 20 s. Si una actualización falla, **conserva lo último** que mostró y lo marca como desactualizado; nunca muestra una cola vacía por error.
- Es de **solo lectura**: no tiene botones ni acciones; no confirma, no edita y no toca existencias.
- **No expone datos personales**: ni teléfono ni conversación salen de la base hacia esta vista.
- Nuevo endpoint autenticado **`GET /api/orders/assembly-queue`** que alimenta el refresco.
- Enlace **«Cola de armado»** en la navegación del staff.

### Impacto visible para el usuario

- **Empleado del obrador:** ve de un vistazo, a distancia y sin tocar nada, qué pedidos de hoy tiene que preparar y en qué orden.
- **Empleado del mostrador:** al confirmar, el pedido llega al obrador sin avisar de palabra.
- **Cliente presente en el local:** no ve números de teléfono ni mensajes de otros clientes en la pantalla.

### Fuera de alcance

- **Marcar un pedido como armado o entregado:** no hay estado `ASSEMBLED` (se revirtió a propósito). La cola se acota al día en curso en lugar de vaciarse por estado.
- **Tiempo real (SSE/WebSockets):** se mantiene el polling de D13.
- **Modo kiosco con sesión propia o sin login:** la pantalla usa una sesión normal de empleado.
- **Indicador de pendientes en la navegación (`US-07`)** y su endpoint `pending-count`: change propio.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Implementa el Requirement *«Cola de armado como proyección de solo lectura»* de `order-confirmation`, ya especificado en `bootstrap-carnik`. El comportamiento no cambia; la elección de qué pedidos cuentan como «pendientes de armado» es una decisión de diseño (ver `design.md`), por eso el change declara `skip_specs`.

## Impact

- **Código:** página `src/app/(staff)/dashboard/page.tsx`, componente cliente `src/components/AssemblyQueue.tsx`, route handler `src/app/api/orders/assembly-queue/route.ts`, consulta en `src/core/orders/queries.ts`, proyección en `src/core/orders/assemblyQueue.ts`, enlace en `src/app/(staff)/layout.tsx`.
- **Datos:** sin migraciones. Lee `Order`, `OrderItem`, `Product` y `Customer.profileName`.
- **API:** un endpoint de lectura nuevo, protegido con `requireRole(STAFF)`.
