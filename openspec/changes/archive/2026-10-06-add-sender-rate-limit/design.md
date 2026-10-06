## Context

Ver `proposal.md` para la motivación y el spec delta de `whatsapp-conversation` para el comportamiento. Estado de partida:

- `ingestInboundMessage` (`src/core/messaging/ingest.ts`) persiste el `Message` y, si la `Conversation` tiene un `Order` en `DRAFT`, lo suma sin interpretar. Si no, consulta el catálogo, llama al drafter (`getOrderDrafter()`, que con `ORDER_DRAFTER=llm` invoca a Claude) y ramifica por intención.
- La misma función atiende `POST /api/webhooks/twilio` y `POST /api/simulator/messages`.
- D14 del bootstrap fija el enfoque: un `count` de `Message` sobre el índice `(conversationId, createdAt)`, sin tabla nueva ni Redis.
- `US-14` modifica en paralelo `ingest.ts` y `replies.ts`.

## Goals / Non-Goals

**Goals:**

- Ninguna llamada al drafter por encima del límite, verificable sin el LLM.
- El mensaje limitado queda registrado y visible para el empleado.
- Cambio en la ingesta reducido a una guarda, sin tocar la ramificación por intención.

**Non-Goals:**

- Precisión de contador distribuido: hay una sola instancia (§2 del readme) y una carrera entre dos mensajes simultáneos como mucho deja pasar uno de más.
- Limitar la respuesta fija a mensajes con adjunto (`ingestUnsupportedMessage`), que no llama a la AI.

## Decisions

### R1 — Valores: 10 mensajes por ventana deslizante de 10 minutos

`RATE_LIMIT_MAX_MESSAGES = 10` y `RATE_LIMIT_WINDOW_MS = 10 min`, constantes exportadas de `src/core/messaging/rateLimit.ts`. Un pedido real ocupa de uno a cuatro mensajes antes de abrir borrador (saludo, pedido, corrección); diez deja holgura para un cliente que escribe por partes. El mensaje undécimo de la ventana ya no llega al drafter. El techo por remitente queda en 60 llamadas a la AI por hora.

*Alternativa considerada:* la ventana de una hora que menciona D14. **Rechazada:** con el mismo techo horario, una ventana corta libera antes a un cliente legítimo que escribió en ráfaga, y el aviso «una vez por ventana» se repite como mucho seis veces por hora.

*Trade-off:* cambiar los valores exige un despliegue; a cambio, no hay variable de entorno nueva que configurar en Railway.

### R2 — Contar filas de `Message`, excluyendo las aclaraciones

`isOverMessageLimit(conversationId)` cuenta los `Message` `INBOUND` de la conversación con `createdAt` dentro de la ventana, incluido el recién registrado, y descarta los que llegaron mientras había un borrador abierto: para cada `Order` de la conversación en `DRAFT` o confirmado dentro de la ventana, se excluye el intervalo `(createdAt, confirmedAt ?? ahora]`. El mensaje que originó el pedido es anterior a su `createdAt` y sí cuenta. Son dos consultas indexadas (`Order` por conversación, `count` de `Message` por `(conversationId, createdAt)`); sin tabla ni columna nueva.

*Alternativa considerada:* contar todos los entrantes. **Rechazada:** un cliente que responde varias preguntas del empleado sobre su borrador quedaría limitado al pedir de nuevo tras la confirmación, y el spec dice que esas aclaraciones no cuentan.

*Trade-off:* una consulta a `Order` además del `count` por mensaje que llega al drafter; a este volumen es despreciable.

### R3 — Guarda única, después del borrador abierto y antes del catálogo

En `ingestInboundMessage`, tras el `return` de `appended` y antes de leer el catálogo, una sola línea delega en `rateLimitedResult(...)`. Los mensajes que se suman a un borrador no llaman a la AI y nunca pasan por la guarda. El resultado nuevo `{ status: "rate_limited", messageId, reply }` no altera los demás.

*Trade-off:* el límite sólo protege el camino que cuesta dinero; un remitente puede seguir escribiendo en una conversación con borrador abierto, lo que sólo genera filas de `Message` para el empleado.

### R4 — Aviso de plantilla, una vez por ventana

`rateLimitReply()` en `src/core/messaging/replies.ts`: «Recibimos muchos mensajes tuyos seguidos. Quedan anotados y una persona del equipo los revisa en breve.» Sin texto del cliente ni de la AI (C3). Antes de enviarlo se busca un `Message` `OUTBOUND` de la conversación con ese mismo cuerpo dentro de la ventana; si existe, no se envía otro. El propio historial hace de marca, sin estado adicional.

*Trade-off:* si el texto de la plantilla cambia en un despliegue, un aviso ya enviado con el texto anterior no se reconoce y el cliente podría recibir un segundo aviso en esa ventana. Es aceptable.

### R5 — Superficies afectadas

- **Tablas Prisma:** `Message` (lectura y alta del aviso), `Order` (lectura). Sin migraciones.
- **Rutas:** `POST /api/webhooks/twilio` sin cambios (sigue respondiendo 200 vacío a Twilio); `POST /api/simulator/messages` devuelve `200` con `{ messageId, rateLimited: true, reply, order: null }`, donde `reply` es el aviso o `null` si ya se envió.
- **Validación en servidor:** no hay entrada nueva; los payloads siguen validándose con Zod en cada ruta (D15) antes de llegar a la ingesta.
- **Variables de entorno:** ninguna nueva.
- **Registros:** un `console.warn` con el id de la conversación, sin número ni cuerpo.

## Risks / Trade-offs

- [Dos mensajes simultáneos en el borde del límite pasan ambos] → una instancia y volumen bajo; el exceso es de uno.
- [Un cliente legítimo supera el límite] → el mensaje queda en la conversación para el empleado, que puede responder a mano; la ventana se libera en 10 minutos.
- [Conflicto de merge con `US-14` en `ingest.ts` y `replies.ts`] → guarda de una línea y plantilla en un bloque propio.

## Migration Plan

Sin migraciones ni variables. Despliegue normal desde `main`; para revertir basta con revertir el commit.
