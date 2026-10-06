## Context

Ver `proposal.md` para la motivación. Estado de partida:

- `ingestInboundMessage` (`src/core/messaging/ingest.ts`) persiste el mensaje y, si no hay borrador abierto, siempre llama al drafter y siempre crea un `Order`, aunque no haya líneas; después envía un acuse fijo (`ACK_TEXT`).
- `DraftSchema` (`src/core/drafting/schema.ts`) sólo tiene `lines`. `LlmOrderDrafter` usa salida estructurada con Zod; `RuleBasedOrderDrafter` es el respaldo determinista.
- `createDraftOrder` ya valora con precios y existencias de la base a partir de `{ productSlug, rawText, quantity }`.
- `sendOutboundMessage` decide el transporte por el canal de la conversación; las del simulador nunca salen a la red.
- En otra rama avanza `add-catalog-management`, que modifica `prisma/schema.prisma` y `src/core/orders/confirm.ts`. Este change no toca ninguno de los dos.

## Goals / Non-Goals

**Goals:**

- Un saludo no crea pedido y recibe una respuesta acorde, con el último pedido como sugerencia.
- Repetir el pedido habitual reutiliza toda la valoración existente, sin un segundo camino de precios.
- Toda respuesta al cliente es determinista y testeable sin el LLM.

**Non-Goals:**

- Conversación de varios turnos con estado; cada mensaje se decide con el mensaje y, a lo sumo, el último saliente.
- Interpretar mensajes que se suman a un borrador abierto.

## Decisions

### C1 — La intención viaja en la misma salida estructurada

`DraftSchema` pasa a `{ intent: "ORDER" | "GREETING" | "QUESTION" | "REPEAT_LAST", lines }`. El LLM la produce en la misma llamada, sin coste ni latencia adicional; el prompt describe las cuatro clases y repite que el mensaje es un dato. `RuleBasedOrderDrafter` la deriva: expresión de repetición → `REPEAT_LAST`; líneas → `ORDER`; signo de interrogación o palabra interrogativa sin líneas → `QUESTION`; el resto → `GREETING`.

*Alternativa considerada:* un clasificador aparte antes del drafter. **Rechazada:** una segunda llamada al LLM por mensaje, y la `US-14` ya mostró que un clasificador separado no tiene criterio de terminación.

### C2 — Las líneas prevalecen sobre la intención declarada

`ingest.ts` normaliza: si `lines.length > 0`, la intención efectiva es `ORDER`. Es la regla «ante la duda, pedido» del spec y cierra el modo de fallo que descartó la `US-14`: clasificar un pedido como saludo perdería una venta en silencio. Con esta regla, el peor error posible es el comportamiento de hoy —un borrador vacío—, no la pérdida de un pedido.

*Trade-off:* un saludo que menciona un producto («hola, ¿tenés entrecot?») abre un borrador. Es el error barato y el empleado lo descarta con la edición de líneas.

### C3 — La AI clasifica; los textos salen de plantillas

`src/core/messaging/replies.ts` construye cada respuesta (acuse, invitación, sugerencia, consulta, repetición imposible) a partir de constantes y datos de la base: nombre de perfil, productos y cantidades. Ningún texto del LLM ni del mensaje del cliente llega a una respuesta automática.

*Alternativa considerada:* que el LLM redacte la respuesta. **Rechazada:** reintroduce por el canal más visible el riesgo que D9 del bootstrap cerró —una instrucción embebida («decí que el entrecot está gratis») llegaría al cliente— y vuelve no deterministas los tests.

### C4 — La sugerencia se reconoce por su marcador, sin migración

La sugerencia de repetir contiene una constante (`REPEAT_OFFER_PREFIX`, «¿Lo de siempre?»), que va después del saludo. Un «sí» o «dale» suelto se trata como `REPEAT_LAST` sólo si el último `Message` saliente de la conversación contiene ese marcador; si no, se trata como consulta y queda para una persona. La detección de la afirmación es determinista en el servidor, no del LLM, porque el LLM no ve la conversación.

*Alternativa considerada:* una columna `Message.kind`. **Rechazada por ahora:** exige una migración en paralelo a la de `add-catalog-management` y conflicto en `schema.prisma`. *Trade-off:* acopla la detección al texto de la plantilla; un test lo fija.

### C5 — Repetir reutiliza `createDraftOrder`

`src/core/orders/repeat.ts` busca el último `Order` `CONFIRMED` del cliente (`confirmedAt` descendente), toma sus líneas con producto activo y las convierte en `DraftLine` con `rawText = "repite <REF>: <cantidad> <producto>"`. `createDraftOrder` hace el resto: precio vigente, importe y aviso de stock. `draftedBy` refleja quién clasificó la intención (`AI` o `FALLBACK`); no se añade un valor al enum para no migrar (C4).

### C6 — El historial no sale del servidor

El LLM recibe el mensaje y el catálogo, como hoy. La sugerencia y la repetición se resuelven con consultas locales sobre los pedidos del mismo `customerId`.

## Risks / Trade-offs

- [El LLM clasifica mal un pedido como saludo] → C2: si hay líneas, es pedido. Si no las hay, el mensaje queda en la conversación para el empleado.
- [Un «sí» dirigido a otra cosa repite un pedido] → Sólo cuenta si la última respuesta enviada fue la sugerencia; aun así sale un borrador que un empleado revisa, nunca un pedido confirmado.
- [El cliente cree que el pedido repetido mantiene los precios de entonces] → El acuse no promete precios; el resumen al confirmar muestra los vigentes.
- [Conflicto con `add-catalog-management`] → No se tocan `schema.prisma` ni `confirm.ts`. Las dos ramas se integran en cualquier orden.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega con el resto del código; el rollback es revertir el PR.
