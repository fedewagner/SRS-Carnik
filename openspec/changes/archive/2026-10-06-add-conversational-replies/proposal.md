## Why

Con WhatsApp real, la primera respuesta del sistema es lo que el cliente percibe del producto, y hoy es torpe: un «hola, quiero hacer un pedido» crea un pedido vacío en el backoffice, recibe un «recibimos tu pedido» que no es cierto y deja un borrador abierto que impide interpretar el mensaje siguiente. Además incumple el spec vigente, que ya exige no crear pedido ni acuse ante un mensaje sin pedido. Y en una carnicería de barrio la frase más común es «lo de siempre», que el sistema no entiende aunque tiene el historial.

## What Changes

- **Intención del mensaje.** El intérprete devuelve, en la misma llamada, si el mensaje es un pedido, un saludo, una consulta o un pedido de repetir el último. **Ante la duda es pedido:** si hay líneas interpretadas, se trata como pedido sea cual sea la intención declarada.
- **Saludo sin pedido:** no se crea borrador. El cliente recibe una invitación —«¡Hola Anna! ¿Qué te preparamos hoy?»— con un ejemplo de cómo pedir.
- **Sugerencia con historial:** si el cliente tiene un pedido confirmado anterior, el saludo le ofrece repetirlo enumerando sus productos y cantidades: «¿Lo de siempre? 2 kg de entrecot y 6 salchichas. Respondé «sí» y lo anotamos».
- **Repetir el último pedido:** «lo de siempre», «lo mismo», o un «sí» en respuesta a esa sugerencia, crean un borrador con las líneas del último pedido confirmado, **a precios y existencias de hoy**.
- **Acuse con lo interpretado:** el acuse de un pedido enumera los productos y cantidades anotados y las menciones sin reconocer, sin precios ni promesa de disponibilidad.
- **Consulta:** no crea pedido; el cliente recibe un aviso neutro de que una persona le responde.

### Impacto visible para el usuario

- **Cliente:** recibe una respuesta acorde a lo que escribió, ve qué se anotó de su pedido y puede repetir su pedido habitual con una palabra.
- **Empleado:** deja de ver pedidos vacíos generados por saludos; un pedido repetido aparece como cualquier borrador, con el texto de origen indicando que es una repetición.
- **Dueño:** el canal suena a carnicería atenta, no a formulario.

### Fuera de alcance

- **Texto libre redactado por la AI.** La AI clasifica; todo lo que se envía al cliente sale de plantillas con datos de la base.
- **Responder consultas de precio o disponibilidad** (catálogo conversacional, `US-14`).
- **Interpretar mensajes que se suman a un borrador abierto.** Hoy se registran sin interpretar; es un hueco conocido que queda para otro change.
- **Repetir un pedido distinto del último**, o elegir entre varios habituales.
- **Mensajes proactivos** al cliente fuera de su propia conversación.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `ai-order-intake`: se añade la clasificación de intención del mensaje, con la regla de que las líneas interpretadas prevalecen, y la repetición del último pedido confirmado.
- `whatsapp-conversation`: el acuse pasa a enumerar lo interpretado, y se añaden las respuestas a un saludo (con sugerencia de historial) y a una consulta.

## Impact

- **Código:** `src/core/drafting/` (esquema con `intent`, prompt del LLM, detección por reglas), `src/core/messaging/ingest.ts` (ramificación por intención), módulo nuevo `src/core/messaging/replies.ts` (plantillas) y `src/core/orders/repeat.ts`.
- **Datos:** sin migraciones. Lee `Order` y `OrderItem` confirmados del mismo cliente.
- **AI:** el esquema de salida suma un campo enumerado; el proveedor sigue sin recibir identificadores del cliente ni su historial, sólo el texto del mensaje y el catálogo.
- **Coordinación:** convive con `add-catalog-management`, en curso en otra rama; no toca `confirm.ts` ni el esquema Prisma para no generar conflictos.
- **Presupuesto:** ~3 h para los tres niveles.
