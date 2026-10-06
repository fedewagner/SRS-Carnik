## Why

El webhook de WhatsApp es público y cada mensaje entrante sin borrador abierto dispara una llamada al proveedor de AI, que cuesta dinero. Un solo remitente —por error, por un bucle de reenvío o con mala intención— puede agotar el presupuesto de AI y llenar el backoffice de borradores. El spec vigente ya exige un límite por cliente (`US-03`, decisión D14 del bootstrap), pero no está implementado.

## What Changes

- **Límite por conversación:** por encima de un máximo de mensajes en una ventana de tiempo, el mensaje se registra pero no se envía al intérprete de AI ni crea un `Order`.
- **Las aclaraciones no cuentan:** los mensajes que se suman a un borrador abierto nunca se limitan ni cuentan como intentos de pedido nuevo.
- **Aviso al cliente, una sola vez por ventana:** al superar el límite, el cliente recibe un texto fijo que le dice que sus mensajes quedaron anotados y que una persona los revisa. Los mensajes siguientes dentro de la misma ventana no reciben respuesta.
- **Mismo comportamiento en el simulador**, que comparte la función de ingesta.

### Impacto visible para el usuario

- **Cliente normal:** ningún cambio; el límite está muy por encima del uso real de una conversación de pedido.
- **Cliente que escribe en ráfaga:** a partir del mensaje que supera el límite recibe un único aviso y sus mensajes siguientes no generan pedidos automáticos hasta que pasa la ventana.
- **Empleado:** sigue viendo todos los mensajes en la conversación, incluidos los limitados, y el aviso enviado.
- **Dueño:** el gasto en AI por remitente queda acotado.

### Fuera de alcance

- **Límite global** (todos los remitentes a la vez) o por número de origen distinto de la conversación.
- **Mensajes con adjunto:** ya no invocan a la AI; siguen recibiendo su respuesta fija sin límite.
- **Bloqueo permanente** o lista negra de remitentes.
- **Configuración del límite desde el backoffice o por variable de entorno:** los valores son constantes del código.
- **Cambios en el esquema de datos:** sin tabla nueva ni Redis (D14).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `whatsapp-conversation`: el Requirement «Límite de consumo por cliente» pasa a fijar la ventana configurable, el aviso único al cliente y que las aclaraciones sobre un borrador abierto no cuentan.

## Impact

- **Código:** módulo nuevo `src/core/messaging/rateLimit.ts`; una guarda temprana en `ingestInboundMessage` (`src/core/messaging/ingest.ts`); plantilla nueva en `src/core/messaging/replies.ts`; rama de respuesta en `src/app/api/simulator/messages/route.ts`.
- **Datos:** sin migraciones. Lee `Message` (índice `(conversationId, createdAt)`) y `Order` de la conversación.
- **AI:** menos llamadas; ninguna por encima del límite.
- **Coordinación:** `US-14` también toca `ingest.ts` y `replies.ts`; la guarda es una línea antes de la llamada al intérprete para facilitar el merge.
