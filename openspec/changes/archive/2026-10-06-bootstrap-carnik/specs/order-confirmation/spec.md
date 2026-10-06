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

Toda edición SHALL validarse en el servidor y SHALL recalcular los importes contra el catálogo. Un `Order` que no esté en borrador SHALL NOT admitir edición de líneas.

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

El sistema SHALL permitir a un usuario con rol `EMPLOYEE` o `ADMIN` corregir la cantidad disponible de un `Product` desde la línea del pedido en la que detecta la discrepancia, sin abandonar el detalle.

El sistema SHALL distinguir productos vendidos por peso, que admiten cantidades fraccionarias, de productos vendidos por pieza, que SHALL admitir únicamente cantidades enteras. La cantidad disponible SHALL NOT poder quedar por debajo de cero.

*Nota de alcance:* este es el único punto de escritura de existencias del sistema. No hay pantalla de gestión de catálogo; los productos se siembran.

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

#### Scenario: Producto agotado (borde)

- **GIVEN** un `Product` cuya cantidad disponible queda en cero tras una confirmación
- **WHEN** un cliente lo pide
- **THEN** la propuesta incluye igualmente la línea, marcada como sin disponibilidad
- **AND** el empleado puede eliminarla, ajustarla o corregir las existencias antes de confirmar

### Requirement: Confirmación transaccional con descuento de existencias

El sistema SHALL permitir a un usuario con rol `EMPLOYEE` o `ADMIN` confirmar un `Order` en borrador. La confirmación SHALL ejecutarse como una **única operación atómica** que cambia el estado del `Order` a confirmado, descuenta la cantidad de cada `OrderItem` de la cantidad disponible del `Product` correspondiente, y deja registrado en el propio `Order` qué usuario confirmó y en qué momento.

La suficiencia de existencias SHALL comprobarse **en el momento de confirmar**, no cuando se generó el borrador. Si cualquier parte de la operación falla, ninguna SHALL persistir. La confirmación SHALL ser idempotente respecto de un mismo `Order`.

#### Scenario: Confirmación correcta

- **GIVEN** un `Order` en borrador con una línea de 1,5 kg de "Entrecot" y existencias suficientes
- **WHEN** el empleado lo confirma
- **THEN** el `Order` pasa a estado confirmado
- **AND** la cantidad disponible de "Entrecot" se reduce en 1,5 kg
- **AND** el `Order` queda con el usuario que confirmó y el momento de la confirmación
- **AND** se dispara el mensaje de resumen al cliente

#### Scenario: Existencias insuficientes en el momento de confirmar (error)

- **GIVEN** un `Order` en borrador cuya cantidad supera la disponible actual
- **WHEN** el empleado intenta confirmarlo
- **THEN** el sistema rechaza la confirmación indicando la línea y la cantidad disponible
- **AND** el `Order` permanece en borrador
- **AND** ningún `Product` ve modificada su cantidad disponible
- **AND** no se envía ningún mensaje al cliente

#### Scenario: Doble confirmación del mismo pedido (borde)

- **GIVEN** un `Order` que acaba de ser confirmado
- **WHEN** se recibe una segunda confirmación por doble clic o por reintento
- **THEN** el sistema no vuelve a descontar existencias
- **AND** no envía un segundo mensaje de resumen al cliente
- **AND** no altera el usuario ni el momento de confirmación ya registrados

### Requirement: Cola de armado como proyección de solo lectura

El sistema SHALL ofrecer una vista que liste los `Order` en estado confirmado pendientes de armado, ordenados de más antiguo a más reciente, actualizándose sin intervención manual.

La vista SHALL ser de solo lectura: SHALL NOT permitir editar, confirmar ni cancelar pedidos, ni modificar existencias.

**Datos personales:** la vista se exhibe en un espacio donde puede haber clientes presentes. SHALL mostrar únicamente el nombre de pila del `Customer` o una referencia corta del pedido, y SHALL NOT mostrar números de teléfono, direcciones ni el contenido de las conversaciones. El acceso SHALL requerir sesión con rol `EMPLOYEE` o `ADMIN`.

#### Scenario: Pedido confirmado aparece en la cola

- **GIVEN** la pantalla del local mostrando la cola de armado
- **WHEN** un empleado confirma un `Order` desde el backoffice
- **THEN** el pedido aparece en la cola en la siguiente actualización automática
- **AND** se muestra con sus líneas, cantidades y hora de confirmación
- **AND** no se muestra el número de teléfono del cliente

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
