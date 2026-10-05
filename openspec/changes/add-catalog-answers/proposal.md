## Why

La consulta más frecuente en el WhatsApp de una carnicería es «¿a cuánto está el entrecot?» o «¿tienen costillas?», y hoy recibe un aviso neutro y espera a que alguien del mostrador, con las manos ocupadas, conteste un dato que ya está en la base. `US-14` había salido del MVP porque un clasificador de intención separado podía perder un pedido en silencio; `add-conversational-replies` cerró ese riesgo con «ante la duda, pedido» (C2) y plantillas fijas (C3), así que ahora la historia es acotada y testeable: sólo cambia qué se responde a un mensaje que ya no era un pedido.

## What Changes

- **Productos consultados.** El intérprete devuelve, en la misma llamada que clasifica la intención, la lista de productos del catálogo por los que el cliente pregunta precio o disponibilidad. El intérprete por reglas obtiene lo mismo con los alias del catálogo. Un producto que no está en el catálogo activo se descarta.
- **Respuesta de catálogo.** Una consulta sin líneas de pedido que nombra productos activos del catálogo recibe una respuesta automática con, para cada uno, su **precio vigente por unidad de venta** y una **disponibilidad cualitativa** («hay disponible» / «hoy no nos queda»), sin cantidades exactas y aclarando que la consulta no reserva. No se crea `Order`.
- **Lo demás no cambia.** Un mensaje con líneas sigue siendo pedido aunque contenga una pregunta. Una consulta que no nombra un producto identificable del catálogo (producto inexistente o inactivo, horarios, envíos…) sigue recibiendo el aviso neutro de que responde una persona.
- **Reglas más finas para «¿tenés X?».** El intérprete por reglas deja de convertir en línea de 1 unidad una pregunta de precio o disponibilidad sin cantidad ni verbo de pedido; cualquier cifra o verbo de pedido («mandame», «reservame», «para mañana») la mantiene como pedido.

### Impacto visible para el usuario

- **Cliente:** recibe al instante precio y disponibilidad de lo que preguntó, con una invitación a pedir escribiendo la cantidad.
- **Empleado:** deja de contestar a mano consultas triviales y deja de descartar borradores de 1 unidad abiertos por un «¿tenés entrecot?». Todas las consultas y respuestas siguen visibles en la conversación.
- **Dueño:** el precio que ve el cliente es siempre el de la base; nunca uno redactado por la AI.

### Fuera de alcance

- **Cantidades exactas de existencias** y cualquier forma de reserva por consulta.
- **Productos inexistentes o inactivos:** no se sugieren sustitutos; responde una persona.
- **Listas de precios completas** («¿qué precios tienen?»): quedan para una persona.
- **Consultas dentro de un borrador abierto:** esos mensajes se siguen sumando a la conversación sin interpretar, como hoy.
- **Preguntas sobre el producto que no son precio ni disponibilidad** (origen, cortes, preparación), horarios y envíos.
- **Texto redactado por la AI:** sigue prohibido (C3 de `add-conversational-replies`).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `conversational-catalog`: la respuesta automática pasa de propuesta Should-have a comportamiento definido: precio vigente y disponibilidad cualitativa de productos activos, sin reservar; aviso neutro para lo no identificable.
- `whatsapp-conversation`: la respuesta a una consulta deja de ser siempre el aviso neutro; puede incluir precio y disponibilidad tomados de `Product`.
- `ai-order-intake`: la salida del intérprete incluye los productos consultados, y una pregunta de precio o disponibilidad sin cantidad ni verbo de pedido deja de producir líneas.

## Impact

- **Código:** `src/core/drafting/` (esquema con `askedProducts`, prompt, reglas y red de seguridad de pedido sobre la salida del LLM), módulo nuevo `src/core/messaging/catalog-answer.ts`, plantilla en `src/core/messaging/replies.ts` y una línea en la rama de consulta de `src/core/messaging/ingest.ts`.
- **Datos:** sin migraciones. Sólo lee `Product` (`pricePerUnitCents`, `unit`, `stockQuantity`, `isActive`).
- **AI:** el esquema de salida suma un campo; el proveedor sigue recibiendo sólo el mensaje y el catálogo, sin precios ni existencias.
- **Coordinación:** no toca `prisma/schema.prisma` ni `confirm.ts` (PR de `add-catalog-management`). El cambio en la ingesta se limita a la rama de consulta para convivir con la guarda de rate limit de `US-03`.
