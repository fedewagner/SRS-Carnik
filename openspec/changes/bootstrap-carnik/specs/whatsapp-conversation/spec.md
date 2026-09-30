# whatsapp-conversation

## Purpose

Mantiene la conversación con el cliente en los dos sentidos por el canal que ya usa: recibe sus mensajes de forma autenticada e idempotente, los convierte en hechos del dominio, y devuelve por el mismo chat el acuse, las aclaraciones del empleado y el resumen de confirmación.

## ADDED Requirements

### Requirement: Handshake de verificación del proveedor

`GET /api/webhooks/whatsapp` SHALL validar `hub.mode=subscribe` y comparar `hub.verify_token` con el token compartido `META_VERIFY_TOKEN`. Con token válido y `hub.challenge` no vacío SHALL responder 200 `text/plain` con el challenge exacto. Token ausente o incorrecto SHALL devolver 403; con token válido, modo incorrecto o challenge ausente SHALL devolver 400. No SHALL persistir datos ni invocar AI. Esta verificación SHALL ser independiente de la firma HMAC del POST y SHALL NOT autorizar mensajes entrantes.

#### Scenario: Handshake válido

- **GIVEN** modo `subscribe`, token compartido correcto y challenge presente
- **WHEN** el proveedor llama a `GET /api/webhooks/whatsapp`
- **THEN** recibe 200 con el challenge exacto como texto plano

#### Scenario: Token ausente o incorrecto (error)

- **GIVEN** una petición GET sin token o con otro valor
- **WHEN** se valida el handshake
- **THEN** responde 403 sin reflejar el challenge ni escribir datos

#### Scenario: Handshake incompleto (borde)

- **GIVEN** token válido pero modo distinto de `subscribe` o challenge ausente/vacío
- **WHEN** se valida el handshake
- **THEN** responde 400 sin procesar ningún mensaje

### Requirement: Recepción autenticada de mensajes entrantes

`POST /api/webhooks/whatsapp` SHALL aceptar mensajes entrantes únicamente cuando la petición esté firmada por el proveedor, y SHALL rechazar cualquier petición cuya firma no valide, sin persistir nada ni disparar procesamiento posterior.

La verificación SHALL calcularse sobre el cuerpo exacto recibido, antes de cualquier parseo o normalización, y SHALL usar comparación en tiempo constante.

#### Scenario: Mensaje entrante con firma válida

- **GIVEN** el proveedor envía un mensaje de texto de un cliente
- **WHEN** la firma de la petición valida contra el secreto de la aplicación
- **THEN** el sistema registra un `Message` entrante asociado a su `Conversation`
- **AND** responde con éxito al proveedor dentro del plazo que este exige

#### Scenario: Firma inválida o ausente (error)

- **GIVEN** una petición dirigida al endpoint de entrada
- **WHEN** la firma falta, no valida, o el cuerpo fue alterado
- **THEN** el sistema rechaza la petición con un código de error de autorización
- **AND** no crea ningún `Customer`, `Conversation`, `Message` ni `Order`
- **AND** no invoca al proveedor de AI
- **AND** registra el rechazo sin incluir el cuerpo ni datos personales

#### Scenario: Entrega repetida del mismo mensaje (borde)

- **GIVEN** un mensaje ya procesado con un identificador de mensaje conocido
- **WHEN** el proveedor reintenta la entrega del mismo identificador
- **THEN** el sistema responde con éxito sin crear un `Message` duplicado
- **AND** no genera un segundo `Order` para el mismo mensaje

### Requirement: Filtrado de eventos que no son mensajes de texto

El sistema SHALL procesar como mensaje únicamente los eventos entrantes de tipo texto, SHALL descartar sin efecto los eventos de estado de entrega, y SHALL rechazar los mensajes con contenido multimedia sin descargar el adjunto.

#### Scenario: Mensaje de texto simple atraviesa el filtro

- **GIVEN** el proveedor entrega un evento de tipo texto, correctamente firmado y sin adjuntos
- **WHEN** el sistema aplica el filtro
- **THEN** el evento se reconoce como mensaje y continúa hacia la ingesta
- **AND** pasa al filtro de intención de `ai-order-intake`; sólo una intención de pedido habilita generación, mientras consultas, saludos e intención incierta se conservan sin `Order` ni acuse

#### Scenario: Evento de estado de entrega

- **GIVEN** el proveedor notifica que un mensaje saliente fue entregado o leído
- **WHEN** el evento llega al mismo endpoint que los mensajes
- **THEN** el sistema responde con éxito
- **AND** no crea ningún `Message` entrante ni modifica ningún `Order`

#### Scenario: Mensaje con adjunto (error)

- **GIVEN** un cliente envía una foto o una nota de voz
- **WHEN** el evento se recibe correctamente firmado
- **THEN** el sistema no descarga ni almacena el contenido multimedia
- **AND** responde al cliente pidiéndole que escriba su pedido en texto
- **AND** deja constancia del mensaje en la `Conversation` sin su contenido

#### Scenario: Varios mensajes en una sola entrega (borde)

- **GIVEN** el proveedor agrupa dos mensajes del mismo cliente en una sola petición
- **WHEN** la petición se procesa
- **THEN** el sistema registra ambos `Message` en orden de llegada
- **AND** el fallo al procesar uno no impide el procesamiento del otro

### Requirement: Identidad del cliente y conversación única

El sistema SHALL identificar al cliente por su número de teléfono y SHALL mantener una única `Conversation` abierta por cliente, a la que se asocian todos sus `Message` entrantes y salientes.

El número de teléfono SHALL tratarse como identificador y **nunca** como credencial: ningún mensaje entrante SHALL, por sí solo, producir un efecto irreversible sobre pedidos o existencias.

**Datos personales:** el número de teléfono, el nombre de perfil y el contenido de los mensajes son datos personales. SHALL poder leerlos únicamente usuarios autenticados con rol `EMPLOYEE` o `ADMIN`. SHALL poder modificar los datos identificativos del `Customer` únicamente el rol `ADMIN`. El contenido de un `Message` ya registrado SHALL ser inmutable para todos los roles. El sistema SHALL NOT escribir números de teléfono completos ni contenido de mensajes en registros de diagnóstico.

#### Scenario: Primer mensaje de un número desconocido

- **GIVEN** llega un mensaje de un número que no existe en el sistema
- **WHEN** el mensaje se procesa
- **THEN** el sistema crea un `Customer` con ese número y el nombre de perfil recibido
- **AND** crea una `Conversation` asociada y registra el `Message` en ella

#### Scenario: Remitente ausente o malformado (error)

- **GIVEN** un evento correctamente firmado cuyo remitente falta o no es un número válido
- **WHEN** el sistema intenta identificar al cliente
- **THEN** descarta el evento sin crear entidades
- **AND** registra el descarte sin incluir el valor recibido

#### Scenario: Cliente conocido que vuelve a escribir (borde)

- **GIVEN** un `Customer` con una `Conversation` que tuvo actividad hace meses
- **WHEN** ese cliente envía un mensaje nuevo
- **THEN** el sistema reutiliza el `Customer` y la `Conversation` existentes
- **AND** no crea un cliente duplicado aunque el nombre de perfil haya cambiado
- **AND** actualiza el nombre de perfil al último recibido

### Requirement: Canal de simulación equivalente y protegido

El sistema SHALL ofrecer un canal de entrada alternativo que produzca exactamente el mismo efecto de dominio que el webhook del proveedor, para permitir desarrollo, pruebas automatizadas y demostración sin dependencia de red externa.

Ese canal SHALL requerir autenticación con rol `EMPLOYEE` o `ADMIN`, **y** SHALL poder deshabilitarse por configuración.

La página del canal de simulación SHALL mostrar el resultado de la ingesta —el `Order` en borrador generado con sus `OrderItem`, importes y avisos de disponibilidad— para que el efecto de un mensaje entrante sea observable sin depender del backoffice.

#### Scenario: Mensaje simulado por un usuario autorizado

- **GIVEN** un usuario autenticado con rol `EMPLOYEE` y el canal habilitado
- **WHEN** envía un texto por el canal de simulación indicando un número de cliente
- **THEN** el sistema produce el mismo resultado que si el mensaje hubiera llegado por el proveedor
- **AND** el `Message` queda marcado con su canal de origen
- **AND** la página muestra el `Order` en borrador resultante con sus líneas e importes

#### Scenario: Acceso no autenticado al canal de simulación (error)

- **GIVEN** una petición sin sesión válida
- **WHEN** intenta usar el canal de simulación
- **THEN** el sistema la rechaza sin procesar el contenido
- **AND** no crea ningún `Message` ni `Order`

#### Scenario: Canal deshabilitado por configuración (borde)

- **GIVEN** el canal de simulación está deshabilitado por variable de entorno
- **WHEN** cualquier petición llega a ese canal, incluso autenticada
- **THEN** el sistema responde como si la ruta no existiera
- **AND** el webhook del proveedor sigue funcionando con normalidad

### Requirement: Envío de mensajes al cliente por el mismo canal

El sistema SHALL enviar al cliente tres tipos de mensaje saliente por el mismo canal, registrando cada uno como `Message` en la `Conversation` con su estado de entrega:

1. Un **acuse de recepción** automático cuando un mensaje entrante genera un pedido en borrador. El acuse SHALL confirmar únicamente la recepción y SHALL NOT comprometer disponibilidad, precios ni plazos.
2. Un **mensaje manual** escrito por un usuario con rol `EMPLOYEE` o `ADMIN` desde el detalle del pedido.
3. Un **resumen** con las líneas finales y el total al confirmarse el pedido, enviado una sola vez por pedido mediante el outbox persistido en la transacción de confirmación. La entrega y recuperación SHALL seguir D12: claim atómico, clave `order-summary:<orderId>`, ningún reenvío de `SENT` y reconciliación antes de reintentar un resultado `UNKNOWN`.

**Datos personales:** todo `Message` saliente SHALL registrar qué usuario lo originó, o si fue generado automáticamente. Un `Message` ya enviado SHALL ser inmutable y SHALL NOT poder editarse ni borrarse desde la interfaz.

#### Scenario: Acuse tras un pedido recibido

- **GIVEN** un mensaje de cliente que genera un pedido en borrador
- **WHEN** la propuesta queda registrada
- **THEN** el sistema envía un acuse de recepción al cliente
- **AND** lo registra como `Message` saliente en la `Conversation`

#### Scenario: El empleado pide una aclaración y el cliente responde

- **GIVEN** un pedido en borrador con una línea sin existencias suficientes
- **WHEN** el empleado escribe "del entrecot me quedan 1,5 kg, ¿te sirve?" y lo envía
- **THEN** el cliente recibe el mensaje por el mismo canal, atribuido a ese usuario
- **AND** su respuesta entra por el flujo de ingesta habitual y aparece en la misma conversación
- **AND** el sistema no crea un segundo pedido en borrador para ese cliente

#### Scenario: El envío falla (error)

- **GIVEN** el proveedor de mensajería devuelve un error, o el último mensaje del cliente está fuera de la ventana que el canal permite para mensajes libres
- **WHEN** el sistema intenta enviar
- **THEN** el fallo queda registrado y visible en la conversación como no entregado
- **AND** el pedido conserva su estado y, si estaba confirmado, sus existencias descontadas
- **AND** el flujo de revisión no se bloquea

#### Scenario: Mensaje manual vacío o desmesurado (error)

- **GIVEN** un empleado en el detalle de un pedido
- **WHEN** intenta enviar un mensaje vacío o que supera el límite admitido por el canal
- **THEN** el sistema rechaza el envío en el servidor indicando el motivo
- **AND** no registra ningún `Message` saliente

#### Scenario: Reintento de confirmación de un pedido ya confirmado (borde)

- **GIVEN** un pedido ya confirmado cuyo resumen fue enviado
- **WHEN** se recibe una segunda petición de confirmación del mismo pedido
- **THEN** el sistema no envía un segundo resumen al cliente

#### Scenario: Mensaje manual sobre un pedido ya confirmado (borde)

- **GIVEN** un pedido ya confirmado y su conversación
- **WHEN** el empleado escribe un mensaje al cliente desde el detalle de ese pedido
- **THEN** el mensaje se envía y se registra en la `Conversation` atribuido a ese usuario
- **AND** el estado del pedido y sus existencias ya descontadas no cambian

### Requirement: Límite de consumo por cliente

El sistema SHALL limitar la cantidad de mensajes entrantes que un mismo `Customer` puede provocar en una ventana de tiempo, para evitar que un remitente agote el presupuesto de AI o sature el backoffice.

#### Scenario: Cliente dentro del límite

- **GIVEN** un cliente que envió pocos mensajes en la última hora
- **WHEN** envía un mensaje nuevo
- **THEN** el sistema lo procesa con normalidad

#### Scenario: Cliente que supera el límite (error)

- **GIVEN** un cliente que superó el límite de mensajes de la ventana
- **WHEN** envía un mensaje adicional
- **THEN** el sistema registra el `Message` pero no invoca al proveedor de AI
- **AND** no crea un `Order` nuevo para ese mensaje
- **AND** el empleado sigue viendo la conversación completa

#### Scenario: Aclaraciones sobre un pedido ya existente (borde)

- **GIVEN** un cliente con un pedido en borrador que responde varias veces seguidas a una pregunta del empleado
- **WHEN** esos mensajes llegan dentro de la ventana
- **THEN** el sistema los registra en la `Conversation` sin crear pedidos adicionales
- **AND** no los cuenta como intentos de pedido nuevo
