## Why

Cuando la AI interpreta mal un pedido o una línea supera el stock, el empleado hoy no puede corregirlo: sólo puede confirmar el borrador tal cual. Con pedidos reales entrando por WhatsApp, esa es la primera fricción del flujo humano.

## What Changes

- Desde el detalle de un pedido en borrador, el empleado puede **cambiar la cantidad** de una línea, **eliminarla** y **añadir una línea** de un producto del catálogo.
- Cada edición se valida en el servidor, recalcula importe, total y aviso de disponibilidad contra la base, y se rechaza si el pedido ya no está en borrador.
- La edición y la confirmación se serializan sobre el mismo pedido: no puede confirmarse una versión que alguien está modificando.

### Impacto visible para el usuario

- **Empleado:** corrige el borrador en la misma pantalla antes de confirmar, sin pedirle al cliente que vuelva a escribir.
- **Cliente:** el resumen que recibe refleja el pedido corregido.

### Fuera de alcance

- **Corrección de existencias desde la línea (`US-09`)** y **mensaje manual al cliente (`US-12`)**: changes propios.
- **Historial de ediciones:** no se audita quién cambió qué línea; la trazabilidad sigue siendo quién confirmó.
- **Edición de pedidos confirmados:** prohibida por el spec.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Implementa el Requirement *«Ajuste de las líneas de un pedido en borrador»* de `order-confirmation`, ya especificado en `bootstrap-carnik` y aplazado en su replanificación; el comportamiento no cambia, por eso el change declara `skip_specs`.

## Impact

- **Código:** server actions en `src/app/(staff)/admin/orders/[id]/actions.ts`, lógica en `src/core/orders/editLines.ts`, componentes `OrderLineRow` y `AddLineForm`, validación en `src/lib/validation/orders.ts`.
- **Datos:** sin migraciones. Escribe `OrderItem` y `Order.totalCents`.
- **Concurrencia:** `confirmOrder` y las ediciones toman el mismo bloqueo de fila del `Order`.
