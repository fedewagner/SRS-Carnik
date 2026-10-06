## Context

`sendOutboundMessage` (`src/core/messaging/outbound.ts`) ya resuelve el canal de la conversación, envía por Twilio sólo si el último entrante llegó por WhatsApp y registra el `Message` como `SENT` o `FAILED` sin propagar el error. Acepta `sentByUserId` pero hasta ahora nadie lo usa: todos los salientes son automáticos. `design.md` de `bootstrap-carnik` ya ubica el mensaje manual como **server action** del detalle (no route handler), junto a las de ajuste de líneas.

## Goals / Non-Goals

**Goals:**
- Una server action fina (rol + Zod + delegar) y la lógica en `src/core/messaging/manual.ts`, sin importar Next.js.
- Atribución del mensaje al usuario de la sesión, nunca a un dato del formulario.

**Non-Goals:**
- Cambiar `sendOutboundMessage`, el esquema Prisma o la ingesta.
- Refresco en vivo de la conversación: se ve al recargar o tras el propio envío (`revalidatePath`).

## Decisions

### D1 · Server action en `actions.ts`, lógica en `core/messaging/manual.ts`

`sendManualMessageAction` llama a `requireRole(STAFF)` como primera línea, valida con `ManualMessageSchema` y delega en `sendManualMessage(orderId, userId, body)`, que busca el `Order` (sólo para obtener su `conversationId`) y llama a `sendOutboundMessage` con `sentByUserId`.
- **Alternativa:** un route handler `POST /api/orders/[orderId]/messages`. Descartada: no hay consumidor externo ni necesidad de E2E concurrente como en la confirmación, y añadir una ruta duplica la frontera HTTP.
- **Trade-off:** la server action no es invocable con `curl` cómodo para probar; se compensa probándola directamente en integración, con y sin sesión.

### D2 · Rechazar, no truncar, por encima de 1600 caracteres

`sendOutboundMessage` trunca a 1600 (límite de Twilio) porque sus textos son generados por el sistema. Para un texto humano, truncar en silencio cambiaría lo que el empleado quiso decir; el spec pide rechazar. `ManualMessageSchema` (`src/lib/validation/messaging.ts`) aplica `trim`, mínimo 1 y máximo 1600, y el límite se cuenta **después** del `trim`. El `<textarea>` lleva `maxLength` como ayuda, pero la validación que cuenta es la del servidor.
- **Trade-off:** el número 1600 vive en dos sitios (`outbound.ts` y la validación). Se acepta para no tocar `outbound.ts`, que otros changes en curso modifican; queda documentado junto a la constante.

### D3 · Sin comprobación de estado del pedido ni bloqueo de fila

El spec permite el mensaje en borrador y confirmado y exige que no cambie el pedido. La operación sólo inserta un `Message`; no toma el bloqueo del `Order` que usan `confirmOrder` y las ediciones de líneas, así que no puede serializarse ni interferir con ellas.
- **Trade-off:** un mensaje y una confirmación simultáneos pueden registrarse en cualquier orden en la conversación; es aceptable porque ninguno depende del otro.

### D4 · Atribución visible con el email del usuario

`getOrderDetail` incluye `sentBy: { email }` en los mensajes; el detalle muestra «por <email>» en los salientes con autor. Un saliente sin `sentByUserId` es automático y se sigue mostrando como hasta ahora.
- **Alternativa:** guardar el email en el `Message`. Descartada: duplica un dato personal y exigiría migración.

### D5 · Resultado del envío en la interfaz

Si el transporte registra `FAILED`, la acción devuelve un aviso («quedó registrado como no entregado») y el mensaje aparece en la conversación marcado como «falló». El formulario sólo se vacía cuando el envío fue `SENT`, para que el empleado no pierda el texto.

## Risks / Trade-offs

- [Fuera de la ventana de 24 h de WhatsApp, Twilio rechaza el texto libre] → queda `FAILED` y visible; el empleado decide llamar por teléfono. Plantillas aprobadas, fuera de alcance.
- [Doble clic envía dos veces] → el botón se deshabilita mientras la acción está pendiente; no hay deduplicación en servidor porque dos mensajes iguales escritos a propósito son legítimos.
- [Conflictos con changes en paralelo que tocan `page.tsx`, `queries.ts` o `src/core/messaging/`] → cambios acotados: un fichero nuevo en `core/messaging/`, una línea en `queries.ts` y un bloque añadido al final del `<aside>` de la conversación.

## Migration Plan

Sin migraciones ni variables de entorno nuevas. Despliegue normal; para revertir basta con revertir el commit.
