## Why

Cuando una línea no tiene existencias o el pedido es ambiguo, el empleado hoy no tiene cómo preguntarle al cliente sin salir del backoffice: tiene que agarrar el teléfono del local y escribir a mano, y esa conversación queda fuera del historial del pedido. Es la pieza que falta para cerrar el ciclo «el cliente escribe → la persona revisa → la persona aclara → el cliente responde» dentro de Carnik.

## What Changes

- En el detalle de un pedido (`/admin/orders/[id]`), un usuario con rol `EMPLOYEE` o `ADMIN` escribe un **mensaje libre** y lo envía al cliente por el mismo canal de la conversación (WhatsApp vía Twilio o simulador).
- El mensaje queda registrado como `Message` saliente en la `Conversation`, **atribuido al usuario** que lo escribió, con su estado de entrega (enviado / falló).
- La conversación del detalle muestra **quién escribió** cada saliente manual (email del usuario); los automáticos (acuse, resumen, respuestas) siguen sin autor.
- El envío se permite tanto en borrador como en pedido confirmado y **no cambia el pedido** (estado, líneas, total ni existencias).
- Un mensaje vacío (o sólo espacios) o que supera el límite del canal (1600 caracteres) se **rechaza en el servidor** con el motivo y no se registra nada.
- La respuesta del cliente sigue entrando por la ingesta habitual: si hay un borrador abierto, se suma a la conversación sin abrir otro pedido.

### Impacto visible para el usuario

- **Empleado / administrador:** un cuadro «Escribir al cliente» debajo de la conversación; ve su mensaje en el hilo con su email y si se entregó o falló.
- **Cliente:** recibe por WhatsApp un mensaje escrito por una persona del local, en la misma conversación donde hizo el pedido.

### Fuera de alcance

- **Plantillas de WhatsApp** para escribir fuera de la ventana de 24 h: si el canal lo rechaza, el mensaje queda como no entregado (comportamiento ya especificado).
- **Reintento** de un mensaje fallido, **edición o borrado** de mensajes enviados (el spec los declara inmutables).
- **Mensajes con adjuntos** y redacción asistida por la AI: el texto lo escribe siempre la persona.
- **Escribir a un cliente sin pedido**: el punto de entrada es el detalle de un pedido.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Implementa el tipo 2 («mensaje manual») del Requirement *«Envío de mensajes al cliente por el mismo canal»* de `whatsapp-conversation`, ya especificado en `bootstrap-carnik` con sus escenarios de aclaración, envío fallido, mensaje vacío o desmesurado y pedido confirmado. El comportamiento no cambia, por eso el change declara `skip_specs`.

## Impact

- **Código:** server action en `src/app/(staff)/admin/orders/[id]/actions.ts`, lógica en `src/core/messaging/manual.ts`, validación en `src/lib/validation/messaging.ts`, componente `ManualMessageForm`, autor del mensaje en `src/core/orders/queries.ts` y en el detalle.
- **Datos:** sin migraciones. Escribe `Message` con `sentByUserId`, campo que ya existe.
- **Dependencias y configuración:** ninguna nueva; reutiliza `sendOutboundMessage` y su transporte `WHATSAPP_TRANSPORT`.
