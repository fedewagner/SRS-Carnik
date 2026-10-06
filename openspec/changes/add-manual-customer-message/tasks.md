# Tasks — Mensaje manual al cliente (US-12)

Rama `feature-us12-manual-message-FJW`, sobre `main`.

## 1. Dominio y validación

- [x] 1.1 `ManualMessageSchema` (orderId + texto con `trim`, 1–1600 caracteres, mensajes de error en español). Toca `src/lib/validation/messaging.ts`
- [x] 1.2 `sendManualMessage(orderId, userId, body)`: busca el `Order`, devuelve `NOT_FOUND` si no existe y si no envía con `sendOutboundMessage` atribuido a `sentByUserId`, sin tocar el pedido. Toca `src/core/messaging/manual.ts`

## 2. Interfaz

- [x] 2.1 `sendManualMessageAction` con `requireRole(STAFF)` como primera línea, validación Zod y aviso si el envío quedó `FAILED`. Toca `src/app/(staff)/admin/orders/[id]/actions.ts`
- [x] 2.2 `ManualMessageForm` (textarea con contador, botón deshabilitado mientras envía, se vacía sólo si se entregó) bajo la conversación del detalle, en borrador y confirmado. Toca `src/components/ManualMessageForm.tsx`, `src/app/(staff)/admin/orders/[id]/page.tsx`
- [x] 2.3 Mostrar el autor (email) de cada saliente manual en la conversación. Toca `src/core/orders/queries.ts`, `src/app/(staff)/admin/orders/[id]/page.tsx`

## 3. Tests

- [x] 3.1 Unitarios del esquema: vacío, sólo espacios, 1600 admitido, 1601 rechazado, `trim`. Toca `tests/unit/manual-message-schema.test.ts`
- [x] 3.2 Integración: envío atribuido en borrador (EMPLOYEE y ADMIN); la respuesta del cliente se suma a la conversación sin segundo borrador; pedido confirmado sin cambios de estado ni existencias; vacío y desmesurado rechazados sin `Message`; fallo de Twilio registrado como `FAILED` con el pedido intacto; pedido inexistente; server action sin sesión rechazada sin tocar la base. Toca `tests/integration/manual-message.test.ts`
- [x] 3.3 E2E: tras confirmar, el empleado escribe al cliente y el mensaje aparece en la conversación con su email. Toca `tests/e2e/order-flow.spec.ts`
