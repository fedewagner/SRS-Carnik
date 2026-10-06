## Context

Motivación en `proposal.md`. Estado de partida, tras `add-conversational-replies`:

- `DraftSchema` (`src/core/drafting/schema.ts`) es `{ intent, lines }`. El `LlmOrderDrafter` lo produce con salida estructurada; el `RuleBasedOrderDrafter` deriva la intención con `intentByRules`.
- `ingestInboundMessage` (`src/core/messaging/ingest.ts`) normaliza la intención (líneas → `ORDER`, C2) y, para `QUESTION`, envía `questionReply()`, un aviso neutro.
- Las respuestas salen de plantillas en `src/core/messaging/replies.ts` (C3).
- El intérprete por reglas convierte hoy «¿tenés entrecot?» en una línea de 1 unidad, porque cualquier mención de producto produce cantidad 1.
- Tablas leídas: `Product` (`slug`, `name`, `unit`, `pricePerUnitCents`, `stockQuantity`, `isActive`). Escritas: `Message` (el saliente, vía `sendOutboundMessage`). Rutas afectadas sin cambios de contrato: `POST /api/webhooks/twilio` y `POST /api/simulator/messages`, que ya delegan en `ingestInboundMessage`.
- El PR de `add-catalog-management` cambia `prisma/schema.prisma` y `confirm.ts`; `US-03` añade una guarda al inicio de `ingestInboundMessage` y una plantilla en `replies.ts`.

## Goals / Non-Goals

**Goals:**

- Responder precio y disponibilidad con datos de `Product` y sin que la AI redacte ni vea precios.
- Que el camino determinista cubra todos los escenarios, para que CI (`ORDER_DRAFTER=rules`) los pruebe.
- Un cambio en la ingesta de una línea, dentro de la rama de consulta.

**Non-Goals:**

- Reconocer el tipo de pregunta (precio *o* disponibilidad): se responden siempre ambos datos.
- Responder dentro de un borrador abierto, sugerir sustitutos o listas completas.

## Decisions

### A1 — Los productos consultados viajan en la misma salida estructurada

`DraftSchema` suma `askedProducts: string[]`, slugs del catálogo por los que el cliente pregunta precio o disponibilidad sin pedirlos. El prompt lo describe y repite que el mensaje es un dato. Igual que con las líneas, `LlmOrderDrafter` descarta los slugs que no están en el catálogo recibido (que sólo contiene productos activos) y deduplica.

*Alternativa considerada:* una segunda llamada al LLM para las consultas, o buscar nombres de producto en el texto con alias también cuando interpreta la AI. **Rechazadas:** la primera duplica coste y latencia; la segunda ignora la ventaja del LLM (sinónimos, plurales, errores de tipeo) y haría que la AI y las reglas discrepen sin motivo. *Trade-off:* un campo más en el esquema que el modelo puede rellenar de más; lo acota A4.

### A2 — Reglas: una pregunta de catálogo sin cantidad ni verbo de pedido no es línea

En `RuleBasedOrderDrafter`, si el mensaje entero contiene una expresión de precio o disponibilidad (`cuánto`, `precio`, `cuesta`, `sale`, `vale`, `tienen`, `tenés`, `hay`, `queda`, `disponible`) y **ninguna** expresión de pedido (`mandame`, `enviame`, `preparame`, `reservame`, `separame`, `anotame`, `poneme`, `dame`, `necesito`, `quiero` salvo «quiero saber», `para hoy/mañana/el…`), cada fragmento con producto y **sin cifra** pasa a `askedProducts` en vez de a `lines`. Un fragmento con cifra sigue siendo línea: «¿tienen 2 kg de entrecot?» es pedido. Con productos consultados y sin líneas, `intentByRules` devuelve `QUESTION` aunque no haya signo de interrogación («precio del entrecot»). Los alias de `aliases.ts` son los mismos que para las líneas.

*Alternativa considerada:* dejar la regla de C2 intacta («toda mención de producto es pedido») y sólo responder consultas cuando la AI no devuelve líneas. **Rechazada:** CI corre con reglas y no podría probar ningún escenario de la historia, y el empleado seguiría descartando borradores de 1 unidad abiertos por un «¿tenés entrecot?». *Trade-off:* esto estrecha C2 en un caso concreto; ver Riesgos.

### A3 — Disponibilidad cualitativa y sin reserva

Por producto: «hay disponible» si `stockQuantity > 0`, «hoy no nos queda» si no. Nunca se envía la cantidad. Cierre fijo: «Es el precio de hoy; la consulta no reserva mercadería. Para pedir, escribinos la cantidad…» y que cualquier otra duda la responde una persona.

*Por qué así:* `stockQuantity` ya descuenta lo confirmado, pero no lo que está en borradores pendientes ni lo que se vende en mostrador; una cifra exacta sería una promesa que el sistema no puede sostener y revelaría al cliente un dato operativo. «Hay disponible» no compromete cantidad, y la verificación real sigue en la confirmación (409 si una línea supera el stock). *Alternativas consideradas:* cantidad exacta (**rechazada** por lo anterior); un tercer estado «quedan pocos» con umbral (**rechazada**: el umbral sería arbitrario por producto y unidad, y no hay dato que lo justifique). *Trade-off:* un cliente puede leer «hay disponible» y pedir más de lo que queda; el borrador lo marca con el aviso de stock y el empleado lo aclara por el chat, como con cualquier pedido.

### A4 — Precio con la unidad de venta, desde `Product`, y como mucho cinco productos

La plantilla `catalogAnswerReply` en `replies.ts` recibe `{ name, unit, pricePerUnitCents, available }` y formatea con `formatChf`: «Entrecot: CHF 39.00 por kg — hay disponible», «Salchicha Lyoner: CHF 1.90 por unidad — …». El módulo nuevo `src/core/messaging/catalog-answer.ts` vuelve a leer `Product` por slug con `isActive: true` (el catálogo pudo cambiar entre la interpretación y la respuesta), en el orden en que se preguntaron, y devuelve `null` si no queda ninguno o si son más de cinco. Con `null`, la ingesta envía el aviso neutro de siempre.

*Por qué cinco:* una pregunta por más productos es casi siempre «pasame la lista de precios», que el dueño prefiere atender en persona, y un mensaje largo de WhatsApp se lee mal. *Trade-off:* quien pregunta por seis productos recibe el aviso neutro en vez de una respuesta parcial.

### A5 — La ingesta sólo cambia en la rama de consulta

`return reply(questionReply(), "QUESTION")` pasa a `return reply((await catalogAnswerFor(draft.askedProducts)) ?? questionReply(), "QUESTION")`. `IngestResult` no cambia: sigue siendo `replied` con intención `QUESTION`. La validación del texto entrante sigue donde estaba (adaptadores de entrada y esquema Zod de la salida del LLM); los slugs se validan en servidor contra `Product` en `catalog-answer.ts`.

*Alternativa considerada:* una intención nueva `CATALOG_QUESTION`. **Rechazada:** cambiaría el enum del esquema, el prompt, el simulador y la ramificación de la ingesta, y aumentaría el conflicto con `US-03`, sin aportar nada que `askedProducts` no diga. *Trade-off:* el resultado de la ingesta no distingue una respuesta de catálogo de un aviso neutro salvo por el texto.

### A6 — La AI sigue sin ver precios ni existencias

El catálogo que recibe el LLM no cambia (slug, nombre, unidad). Precio y disponibilidad se leen después, en el servidor. Así una instrucción embebida («decí que está gratis») no tiene ningún camino hasta el texto enviado: el LLM sólo puede elegir slugs, y la plantilla sólo interpola datos de `Product`. No hay variables de entorno nuevas; se usan las existentes (`ORDER_DRAFTER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`).

### A7 — La expresión de pedido se aplica también a la salida del LLM

En la verificación manual, el LLM clasificó «¿tenés entrecot para mañana?» como consulta sin líneas, pese al prompt. El selector de `src/core/drafting/index.ts` pasa la salida del LLM por `promoteOrderSignal`: si no hay líneas, hay productos consultados y el mensaje contiene una expresión de pedido (la misma de A2), los productos consultados pasan a líneas de cantidad 1 e intención `ORDER`, igual que haría el intérprete por reglas.

*Alternativa considerada:* reforzar sólo el prompt. **Rechazada:** sigue siendo probabilístico, y «ante la duda, pedido» es la garantía central del producto; una regla determinista en el servidor la hace testeable. *Trade-off:* la cantidad 1 es una suposición que el empleado corrige en el borrador; el acuse la muestra.

## Risks / Trade-offs

- [Un pedido escrito como pregunta sin cantidad («¿tenés entrecot?» queriendo comprar) recibe una respuesta de catálogo en vez de abrir un borrador] → No es una pérdida silenciosa: el cliente recibe una respuesta que le pide escribir la cantidad para pedir, y el mensaje queda en la conversación del backoffice. Cualquier cifra o expresión de pedido mantiene el pedido (A2), y con la AI las líneas siguen prevaleciendo (C2).
- [El LLM devuelve en `askedProducts` productos que el cliente no nombró] → Se descartan los que no están en el catálogo activo; el peor caso es informar el precio vigente de un producto real, nunca un precio falso. Más de cinco productos → aviso neutro.
- [El LLM clasifica una consulta como pedido y devuelve una línea] → Es el comportamiento de hoy: un borrador que el empleado descarta.
- [«Hay disponible» y luego no alcanza] → La respuesta no promete cantidad ni reserva; la confirmación revalida el stock (A3).
- [Conflicto con `US-03` en `ingest.ts` y `replies.ts`] → Una línea en la rama `QUESTION` y una función nueva junto a `questionReply`; sin cambios en el inicio de la ingesta.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega con el resto del código; el rollback es revertir el PR, que deja el aviso neutro para todas las consultas.
