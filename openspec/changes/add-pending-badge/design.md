## Context

D13 de `bootstrap-carnik` ya fija el mecanismo: polling cada 10 s contra `GET /api/orders/pending-count`. El backoffice no tiene endpoints de lectura (las páginas son Server Components); éste es la excepción porque lo consume un componente cliente que vive en la navegación y sobrevive a la navegación entre páginas. La autorización se comprueba en cada handler, nunca en middleware (D5).

## Goals / Non-Goals

**Goals:**
- Un indicador visible en todo el backoffice que se actualice solo y que ante un fallo nunca muestre un cero falso.
- La regla «último valor / desactualizado» verificable con Vitest en entorno `node`, sin añadir jsdom ni Testing Library.

**Non-Goals:**
- Reducir la latencia por debajo de 10 s.
- Refrescar páginas distintas del listado.

## Decisions

### Endpoint: `GET /api/orders/pending-count` → `200 { "count": number }`

`requireRole(STAFF)` es la primera operación; sin sesión válida responde `401 UNAUTHENTICATED` con `jsonError`, sin tocar la base. La consulta es `countPendingOrders()` en `src/core/orders/queries.ts`: `db.order.count({ where: { status: "DRAFT" } })` sobre la tabla `Order`, que tiene índice por `status`. Responde con `Cache-Control: no-store` y la ruta es `force-dynamic`.

No recibe parámetros: no hay entrada de usuario que validar más allá de la cookie de sesión, que valida `iron-session` dentro de `requireRole`.

*Trade-off:* un `count` cada 10 s por pestaña abierta. Con 2–6 empleados es despreciable; a cambio, ni caché ni tabla de contadores que mantener coherente.

*Alternativa considerada:* reutilizar `listOrders()` y contar en memoria, como hace hoy el listado. **Rechazada:** trae hasta 100 pedidos con cliente para devolver un entero, y además se trunca a 100.

### Lógica del indicador como función pura

`src/components/pendingBadgeState.ts` exporta `parsePendingCount(status, body)` (convierte la respuesta en éxito o fallo; un cuerpo que no sea un entero ≥ 0 es fallo) y `nextBadgeState(prev, result)` (en éxito guarda el número y quita la marca; en fallo conserva el número y marca `stale`). El estado inicial es `{ count: null, stale: false }`: «todavía no sé», que se muestra como «…», nunca como 0.

*Trade-off:* el efecto del componente (temporizador, `fetch`, `router.refresh`) queda sin test unitario; lo cubre el E2E. Probar el componente exigiría jsdom y Testing Library para un `useEffect` de pocas líneas.

### Polling

`setInterval` de 10 s más una consulta inmediata al montar. Cada consulta lleva `AbortSignal.timeout(8000)`: una petición colgada cuenta como fallo y no se solapa con la siguiente. Con la pestaña oculta (`document.hidden`) se salta el tick, y al volver a ser visible consulta en el acto.

Un `401` (sesión caducada) se trata como cualquier fallo: marca desactualizado sin redirigir, para no sacar al empleado de una edición a medias; la siguiente navegación lo lleva al login por el layout.

### Refresco del listado

Si el número cambia respecto de un valor conocido y la ruta es exactamente `/admin/orders`, el badge llama a `router.refresh()`. En el detalle no se refresca: el empleado puede estar editando una línea.

*Trade-off:* el listado puede tardar hasta 10 s en reflejar un pedido nuevo, y no refleja cambios que no alteren el número (p. ej. una confirmación y un pedido nuevo en el mismo intervalo). Aceptable: el número es la señal; el listado completo está a una recarga.

### Variables de entorno

Ninguna nueva.

## Risks / Trade-offs

- [Conflicto con `US-13`, que añade un enlace en la misma `<nav>` de `src/app/(staff)/layout.tsx`] → cambio mínimo: un import y un elemento justo después del enlace «Pedidos».
- [Dos contadores en el listado (el estático y el badge)] → el refresco los mantiene iguales; retirar el estático queda fuera de alcance.
- [Muchas pestañas abiertas multiplican las consultas] → se saltan los ticks de pestañas ocultas.
