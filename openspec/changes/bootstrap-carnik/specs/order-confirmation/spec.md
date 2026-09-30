# order-confirmation

## Purpose

Da al empleado del mostrador el control final sobre cada pedido en el menor número de toques posible: ver la propuesta junto a la conversación que la originó, ajustar lo que haga falta y confirmarla, de modo que ningún pedido llegue al obrador sin que una persona lo haya validado y sin que las existencias queden desalineadas con lo comprometido.

## ADDED Requirements

### Requirement: Acceso restringido a los pedidos y a su conversación

El sistema SHALL exigir una sesión autenticada con rol `EMPLOYEE` o `ADMIN` para leer o modificar cualquier `Order`, `OrderItem`, `Conversation` o `Message`.

La comprobación de autorización SHALL realizarse en el servidor, dentro de cada operación de lectura y de escritura, y SHALL NOT depender de que la interfaz oculte un control.

**Datos personales:** el detalle de un pedido expone el nombre y el número del `Customer` y el historial completo de la conversación. SHALL poder leerlos los roles `EMPLOYEE` y `ADMIN`. SHALL poder modificar líneas y estado de un `Order`, y ajustar existencias, los roles `EMPLOYEE` y `ADMIN`. SHALL poder modificar los datos identificativos de un `Customer` únicamente el rol `ADMIN`. Ningún acceso anónimo SHALL obtener datos de clientes.

#### Scenario: Empleado autenticado abre un pedido

- **GIVEN** un usuario con sesión válida y rol `EMPLOYEE`
- **WHEN** abre el detalle de un `Order` en borrador
- **THEN** ve sus `OrderItem`, los avisos de disponibilidad y la `Conversation` asociada

#### Scenario: Acceso sin sesión válida (error)

- **GIVEN** una petición sin sesión, o con una sesión expirada
- **WHEN** solicita el detalle de un `Order` o intenta modificarlo
- **THEN** el sistema deniega la operación
- **AND** no devuelve datos del `Customer` ni de la conversación

#### Scenario: Operación invocada directamente sin pasar por la interfaz (borde)

- **GIVEN** un usuario sin rol `EMPLOYEE` ni `ADMIN` que conoce el identificador de un `Order`
- **WHEN** invoca directamente la operación de edición, de ajuste de existencias o de confirmación
- **THEN** el sistema la rechaza en el servidor
- **AND** el `Order` y las existencias permanecen sin cambios

### Requirement: Revisión con el mínimo número de acciones

Un `Order` en borrador que no requiere ajustes SHALL poder confirmarse en **como máximo dos interacciones** desde el listado: abrir el detalle y confirmar. El detalle SHALL mostrar en una sola pantalla, sin navegación adicional, las líneas, los avisos de disponibilidad, el total y la conversación.

El sistema SHALL señalar de forma visible la existencia de pedidos en borrador pendientes y SHALL actualizar esa señal sin recarga manual.

*Restricción de diseño:* el usuario opera de pie, con las manos ocupadas y un cliente esperando enfrente. El límite de dos interacciones es la traducción verificable de esa restricción.

#### Scenario: Confirmación sin ajustes desde el listado

- **GIVEN** un `Order` en borrador cuyas líneas son correctas y tienen existencias suficientes
- **WHEN** el empleado lo confirma partiendo del listado de pendientes
- **THEN** lo consigue en dos interacciones: abrir el detalle y confirmar
- **AND** no necesita abrir otra pantalla para ver las líneas, los avisos, el total ni la conversación

#### Scenario: Aparece un pedido nuevo

- **GIVEN** un empleado con el backoffice abierto y sin pedidos pendientes
- **WHEN** llega un mensaje de cliente que genera un `Order` en borrador
- **THEN** el indicador de pendientes pasa a mostrar el pedido nuevo sin recarga manual

#### Scenario: El sistema no puede consultar los pendientes (error)

- **GIVEN** la consulta de pedidos pendientes falla
- **WHEN** el backoffice intenta actualizar el indicador
- **THEN** la interfaz conserva el último valor conocido y señala que está desactualizada
- **AND** no muestra cero pendientes como si no hubiera trabajo

#### Scenario: Dos empleados sobre la misma lista (borde)

- **GIVEN** dos empleados con el backoffice abierto simultáneamente
- **WHEN** uno de ellos confirma un pedido
- **THEN** el pedido deja de contarse como pendiente para ambos en la siguiente actualización

### Requirement: Ajuste de las líneas de un pedido en borrador

El sistema SHALL permitir a un usuario con rol `EMPLOYEE` o `ADMIN` modificar la cantidad de un `OrderItem`, eliminar líneas y añadir líneas de productos del catálogo, **mientras el `Order` esté en estado borrador**.

Toda edición SHALL validar unidad y precisión según `ai-order-intake`, adquirir el bloqueo del `Order` antes de comprobar su estado y recalcular los importes con el snapshot y el redondeo de D3. Solo las líneas nuevas o cuyo producto se sustituye toman el precio vigente del catálogo. Un `Order` que no esté en borrador SHALL NOT admitir edición de líneas.

#### Scenario: Ajuste de una cantidad

- **GIVEN** un `Order` en borrador con una línea de 2 kg de "Entrecot"
- **WHEN** el empleado la ajusta a 1,5 kg y guarda
- **THEN** el sistema recalcula el importe de la línea y el total del pedido
- **AND** el aviso de disponibilidad insuficiente desaparece si la cantidad ya es cubrible

#### Scenario: Cantidad inválida (error)

- **GIVEN** un `Order` en borrador
- **WHEN** el empleado introduce una cantidad negativa, cero o no numérica
- **THEN** el sistema rechaza el cambio en el servidor indicando el motivo
- **AND** conserva el resto de las líneas y los valores ya introducidos

#### Scenario: Intento de editar un pedido ya confirmado (borde)

- **GIVEN** un `Order` en estado confirmado
- **WHEN** se intenta modificar, añadir o eliminar una de sus líneas
- **THEN** el sistema rechaza la operación
- **AND** el pedido y las existencias descontadas permanecen sin cambios

### Requirement: Corrección de existencias desde la línea del pedido

El sistema SHALL permitir a un usuario con rol `EMPLOYEE` o `ADMIN` corregir la cantidad disponible de un `Product` desde la línea del pedido en la que detecta la discrepancia, sin abandonar el detalle. El `Product` SHALL estar activo; la autorización, actividad y unidad válida SHALL comprobarse en el servidor en la operación que escribe.

El sistema SHALL distinguir productos vendidos por peso, que admiten cantidades fraccionarias, de productos vendidos por pieza, que SHALL admitir únicamente cantidades enteras. La cantidad disponible SHALL NOT poder quedar por debajo de cero.

*Nota de alcance:* este es el único punto de corrección manual de existencias, además del descuento transaccional al confirmar. No hay pantalla de gestión de catálogo; los productos se siembran.

#### Scenario: El empleado corrige lo que hay en la cámara

- **GIVEN** una línea de "Entrecot" marcada con disponibilidad insuficiente
- **WHEN** el empleado corrige la cantidad disponible a 3 kg desde esa misma línea
- **THEN** el aviso de la línea se recalcula contra el nuevo valor
- **AND** el pedido permanece en borrador, sin confirmarse por ello

#### Scenario: Cantidad no válida para la unidad del producto (error)

- **GIVEN** un producto vendido por pieza
- **WHEN** se intenta fijar una cantidad disponible de 2,5 unidades, o un valor negativo
- **THEN** el sistema rechaza el ajuste en el servidor indicando la unidad esperada
- **AND** la cantidad anterior se conserva

#### Scenario: Ajuste de un producto inactivo (error)

- **GIVEN** un usuario autorizado y un `Product` inactivo
- **WHEN** intenta corregir sus existencias, incluso con cantidad y unidad válidas
- **THEN** se rechaza el ajuste en el servidor y se conserva la cantidad anterior

#### Scenario: Producto agotado (borde)

- **GIVEN** un `Product` cuya cantidad disponible queda en cero tras una confirmación
- **WHEN** un cliente lo pide
- **THEN** la propuesta incluye igualmente la línea, marcada como sin disponibilidad
- **AND** el empleado puede eliminarla, ajustarla o corregir las existencias antes de confirmar

### Requirement: Confirmación transaccional con descuento de existencias

El sistema SHALL permitir a un usuario con rol `EMPLOYEE` o `ADMIN` confirmar un `Order` en borrador. La confirmación SHALL ejecutarse como una **única operación atómica** que cambia el estado del `Order` a confirmado, descuenta la cantidad de cada `OrderItem` de la cantidad disponible del `Product` correspondiente, deja registrado en el propio `Order` qué usuario confirmó y en qué momento, y crea el resumen en un outbox persistente (`Message` `PENDING` con `summaryOrderId` único y clave `order-summary:<orderId>`).

La suficiencia de existencias SHALL comprobarse **en el momento de confirmar**, no cuando se generó el borrador. Antes de cambiar el estado, el servidor SHALL exigir al menos una línea (`409 EMPTY_ORDER`) y que todas estén resueltas con `Product` no nulo y resoluble (`409 UNRESOLVED_ITEMS`, `orderItemIds` afectados); SHALL validar cantidad/unidad. Si cualquier parte de la transacción falla, ninguna SHALL persistir. La confirmación SHALL ser idempotente respecto de un mismo `Order`, serializando ediciones y confirmaciones con el bloqueo del pedido.

El envío externo SHALL ocurrir después del commit usando el outbox, con el cuerpo y total congelados. SHALL conservar pedido, auditoría y descuentos aunque falle el proveedor. SHALL usar claim atómico y la misma `deliveryKey` por `Order` en todos los intentos; una fila `SENT` SHALL NOT reenviarse. Los fallos inequívocos de no entrega SHALL quedar `FAILED` y admitir reintento autorizado sobre la misma fila. Un timeout ambiguo o `SENDING` sin resolver durante 60 s SHALL quedar `UNKNOWN` y requerir reconciliación (automática si el transporte la soporta, manual en caso contrario); SHALL NOT provocar un reenvío sin deduplicación o certeza de no entrega. Véase D12: sin soporte del proveedor, la entrega incierta queda pendiente de comprobación, sin prometer entrega garantizada.

#### Scenario: Confirmación correcta

- **GIVEN** un `Order` en borrador con una línea de 1,5 kg de "Entrecot" y existencias suficientes
- **WHEN** el empleado lo confirma
- **THEN** el `Order` pasa a estado confirmado
- **AND** la cantidad disponible de "Entrecot" se reduce en 1,5 kg
- **AND** el `Order` queda con el usuario que confirmó y el momento de la confirmación
- **AND** se persiste el outbox en la misma transacción y solo después del commit se intenta enviar el resumen

#### Scenario: Existencias insuficientes en el momento de confirmar (error)

- **GIVEN** un `Order` en borrador cuya cantidad supera la disponible actual
- **WHEN** el empleado intenta confirmarlo
- **THEN** el sistema rechaza la confirmación indicando la línea y la cantidad disponible
- **AND** el `Order` permanece en borrador
- **AND** ningún `Product` ve modificada su cantidad disponible
- **AND** no se envía ningún mensaje al cliente

#### Scenario: Pedido sin líneas (error)

- **GIVEN** un `Order` en borrador sin `OrderItem`
- **WHEN** se intenta confirmar
- **THEN** responde `409 EMPTY_ORDER` antes de cambiar el estado
- **AND** no modifica stock, auditoría ni outbox

#### Scenario: Línea sin resolver o producto no resoluble (error)

- **GIVEN** un borrador con alguna línea `UNRESOLVED`, `productId` nulo o referencia que no resuelve a `Product`
- **WHEN** se intenta confirmar
- **THEN** responde `409 UNRESOLVED_ITEMS` identificando las líneas
- **AND** no modifica estado, stock, auditoría ni outbox, tampoco los de las líneas válidas

#### Scenario: Fallo o interrupción después del commit

- **GIVEN** el pedido confirmado, sus descuentos y un único resumen persistido
- **WHEN** el proceso termina antes del envío o el proveedor falla
- **THEN** el pedido sigue confirmado y las existencias descontadas
- **AND** el resumen pendiente o fallido admite recuperación desde el backoffice usando la misma fila y clave
- **AND** dos reintentos concurrentes solo adquieren un claim
- **AND** si el proveedor pudo aceptarlo antes de perderse la respuesta, queda `UNKNOWN` hasta reconciliar, sin segundo envío a ciegas

#### Scenario: Doble confirmación del mismo pedido (borde)

- **GIVEN** un `Order` que acaba de ser confirmado
- **WHEN** se recibe una segunda confirmación por doble clic o por reintento
- **THEN** el sistema no vuelve a descontar existencias
- **AND** no envía un segundo mensaje de resumen al cliente
- **AND** no altera el usuario ni el momento de confirmación ya registrados

### Requirement: Cola de armado como proyección de solo lectura

El sistema SHALL ofrecer una vista que liste únicamente los `Order` con `status = CONFIRMED` y `assembledAt = null` (pendientes de armado), ordenados de más antiguo a más reciente, actualizándose sin intervención manual.

Una operación `markAssembled` en el detalle del backoffice SHALL exigir `EMPLOYEE` o `ADMIN` y cambiar atómicamente `assembledAt` de null al instante actual solo para pedidos confirmados. SHALL rechazar borradores; repetirla SHALL conservar la fecha original sin tocar líneas, stock ni mensajes.

La vista SHALL ser de solo lectura: SHALL NOT permitir editar, confirmar ni cancelar pedidos, ni modificar existencias.

**Datos personales:** la vista se exhibe en un espacio donde puede haber clientes presentes. SHALL mostrar únicamente el nombre de pila del `Customer` o una referencia corta del pedido, y SHALL NOT mostrar números de teléfono, direcciones ni el contenido de las conversaciones. El acceso SHALL requerir sesión con rol `EMPLOYEE` o `ADMIN`.

#### Scenario: Pedido confirmado aparece en la cola

- **GIVEN** la pantalla del local mostrando la cola de armado
- **WHEN** un empleado confirma un `Order` desde el backoffice
- **THEN** el pedido aparece en la cola en la siguiente actualización automática
- **AND** se muestra con sus líneas, cantidades y hora de confirmación
- **AND** no se muestra el número de teléfono del cliente

#### Scenario: El empleado termina el armado

- **GIVEN** un pedido confirmado visible en la cola
- **WHEN** un empleado lo marca armado desde el detalle del backoffice
- **THEN** se registra `assembledAt` y desaparece de la cola en el siguiente refresco
- **AND** si era el último, se muestra el estado vacío
- **AND** repetir la operación conserva la fecha; intentarla sobre un borrador se rechaza

#### Scenario: La consulta de la cola falla (error)

- **GIVEN** la pantalla del local con pedidos ya visibles
- **WHEN** una actualización no puede completarse
- **THEN** la vista conserva los últimos pedidos conocidos
- **AND** indica de forma visible que los datos pueden estar desactualizados
- **AND** no muestra una cola vacía como si no hubiera trabajo pendiente

#### Scenario: No hay pedidos pendientes de armado (borde)

- **GIVEN** ningún `Order` confirmado pendiente
- **WHEN** se carga la vista
- **THEN** muestra un estado vacío explícito indicando que no hay pedidos por armar
- **AND** sigue actualizándose por si llega uno nuevo
