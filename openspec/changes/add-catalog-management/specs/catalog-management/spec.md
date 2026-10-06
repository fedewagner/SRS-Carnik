# catalog-management

## Purpose

Permite al dueño y a los empleados mantener el catálogo alineado con la realidad del local: qué se vende, a qué precio y cuánto queda disponible, de modo que cada propuesta de pedido se valore y se compare contra datos vigentes, y que cada variación de existencias quede explicada en un registro.

## ADDED Requirements

### Requirement: Acceso y permisos sobre el catálogo

El sistema SHALL exigir una sesión autenticada con rol `EMPLOYEE` o `ADMIN` para leer cualquier `Product` o `StockMovement` desde el backoffice.

Sólo el rol `ADMIN` SHALL poder dar de alta un `Product` o modificar su precio unitario. Los roles `EMPLOYEE` y `ADMIN` SHALL poder registrar ingresos y reajustes de existencias. La comprobación SHALL realizarse en el servidor dentro de cada operación y SHALL NOT depender de que la interfaz oculte un control.

**Datos personales:** el catálogo no contiene datos de `Customer`. Cada `StockMovement` identifica al `User` que lo originó; SHALL poder leerlo `EMPLOYEE` y `ADMIN`. Ningún rol SHALL poder modificar ni borrar un `StockMovement` una vez creado.

#### Scenario: Empleado abre el catálogo

- **GIVEN** un usuario con sesión válida y rol `EMPLOYEE`
- **WHEN** abre la sección de catálogo
- **THEN** ve los productos con sus precios y existencias
- **AND** no ve los controles de alta de producto ni de cambio de precio

#### Scenario: Empleado invoca el cambio de precio sin pasar por la interfaz (error)

- **GIVEN** un usuario con rol `EMPLOYEE`
- **WHEN** invoca directamente la operación de cambio de precio o de alta de producto
- **THEN** el servidor la rechaza
- **AND** el `Product` no cambia y no se crea ninguno

#### Scenario: Sesión expirada al guardar un reajuste (borde)

- **GIVEN** un usuario con la ficha de un producto abierta cuya sesión acaba de expirar
- **WHEN** envía un reajuste de existencias
- **THEN** el servidor rechaza la operación y no se registra ningún `StockMovement`
- **AND** el usuario es dirigido al inicio de sesión

### Requirement: Consulta del catálogo con existencias y comprometido del día

El sistema SHALL listar cada `Product` activo con su nombre, unidad, precio unitario en CHF por kilogramo o por pieza, existencias disponibles y la cantidad **comprometida hoy**: la suma de las cantidades de `OrderItem` de ese producto en `Order` confirmados durante el día en curso en la zona horaria `Europe/Zurich`.

La ficha de cada `Product` SHALL mostrar además su historial de `StockMovement`, del más reciente al más antiguo.

#### Scenario: El dueño revisa el catálogo por la mañana

- **GIVEN** "Entrecot" con 4,500 kg disponibles y dos pedidos confirmados hoy que suman 1,500 kg de entrecot
- **WHEN** el dueño abre el catálogo
- **THEN** ve "Entrecot" a su precio por kg, 4,500 kg disponibles y 1,500 kg comprometidos hoy

#### Scenario: Producto agotado (borde)

- **GIVEN** un `Product` con existencias disponibles en cero
- **WHEN** se lista el catálogo
- **THEN** el producto aparece igualmente, señalado como sin existencias

#### Scenario: Pedido confirmado ayer (borde)

- **GIVEN** un `Order` confirmado el día anterior a las 23:50 hora de Zúrich
- **WHEN** se calcula lo comprometido hoy
- **THEN** sus líneas no se cuentan

### Requirement: Alta de producto

El sistema SHALL permitir al rol `ADMIN` crear un `Product` con nombre, unidad (`WEIGHT_KG` o `PIECE`), precio unitario y, opcionalmente, existencias iniciales. El nombre SHALL ser único sin distinguir mayúsculas ni acentos. El precio SHALL ser mayor que cero con como máximo dos decimales. Las existencias iniciales SHALL respetar la unidad: hasta tres decimales en `WEIGHT_KG`, enteras en `PIECE`, nunca negativas.

Si las existencias iniciales son mayores que cero, el alta SHALL registrar en la misma transacción un `StockMovement` de tipo `INTAKE`. El producto nuevo SHALL quedar disponible para la interpretación de pedidos y para añadir líneas a un borrador.

#### Scenario: El dueño da de alta un corte nuevo

- **GIVEN** un usuario `ADMIN`
- **WHEN** crea "Picanha", por kg, a 48,00 CHF, con 6 kg iniciales
- **THEN** el `Product` aparece en el catálogo con esos valores
- **AND** existe un `StockMovement` `INTAKE` de +6,000 kg a su nombre

#### Scenario: Datos no válidos (error)

- **GIVEN** un usuario `ADMIN`
- **WHEN** intenta crear un producto sin nombre, con precio 0 o negativo, con precio de tres decimales, o por pieza con 2,5 unidades iniciales
- **THEN** el servidor rechaza el alta indicando el campo inválido
- **AND** no se crea ningún `Product` ni `StockMovement`

#### Scenario: Nombre ya existente (borde)

- **GIVEN** un `Product` "Entrecot"
- **WHEN** el `ADMIN` intenta crear "entrecôt"
- **THEN** el servidor rechaza el alta indicando que el producto ya existe

### Requirement: Cambio de precio unitario con recálculo de borradores

El sistema SHALL permitir al rol `ADMIN` modificar el precio unitario de un `Product`, con las mismas reglas de validación que el alta.

En la misma transacción, el sistema SHALL recalcular el precio unitario y el importe de cada `OrderItem` de ese producto que pertenezca a un `Order` en borrador, y el total de cada uno de esos `Order`. SHALL NOT modificar ningún `OrderItem` ni `Order` confirmado. Un borrador que se esté confirmando en ese momento SHALL terminar valorado entero con un único precio, el anterior o el nuevo, nunca una mezcla.

#### Scenario: El dueño sube el precio del entrecot

- **GIVEN** "Entrecot" a 39,00 CHF/kg, un `Order` en borrador con 1,500 kg de entrecot y un `Order` confirmado con 1 kg
- **WHEN** el `ADMIN` fija 42,00 CHF/kg
- **THEN** la línea del borrador pasa a 42,00 CHF/kg y su importe a 63,00 CHF, y el total del borrador se recalcula
- **AND** la línea del pedido confirmado conserva 39,00 CHF/kg y su importe

#### Scenario: Importe no válido (error)

- **GIVEN** cualquier `Product`
- **WHEN** el `ADMIN` envía 0, un valor negativo, texto o 12,345
- **THEN** el servidor rechaza el cambio indicando el formato esperado
- **AND** el precio y los borradores no cambian

#### Scenario: Confirmación simultánea al cambio de precio (borde)

- **GIVEN** un `Order` en borrador con entrecot
- **WHEN** un empleado lo confirma mientras el `ADMIN` cambia el precio del entrecot
- **THEN** el pedido queda confirmado con todas sus líneas al precio anterior, o con todas al nuevo
- **AND** el resumen enviado al cliente coincide con lo que quedó guardado

### Requirement: Ingreso de existencias tras el envasado

El sistema SHALL permitir a `EMPLOYEE` y `ADMIN` sumar una cantidad positiva a las existencias disponibles de un `Product`, válida para su unidad. El ingreso SHALL aplicarse como incremento sobre el valor almacenado en ese momento, no como valor absoluto, y SHALL registrar un `StockMovement` de tipo `INTAKE` en la misma transacción.

Tras el ingreso, el aviso de disponibilidad de las líneas en borrador de ese producto SHALL recalcularse contra el nuevo valor.

#### Scenario: Se cargan 5 kg de entrecot recién envasado

- **GIVEN** "Entrecot" con 2,000 kg disponibles y un borrador con una línea de 3 kg marcada con disponibilidad insuficiente
- **WHEN** el empleado registra un ingreso de 5 kg
- **THEN** las existencias pasan a 7,000 kg
- **AND** existe un `StockMovement` `INTAKE` de +5,000 kg con anterior 2,000 y resultado 7,000
- **AND** la línea del borrador deja de estar marcada

#### Scenario: Cantidad no válida (error)

- **GIVEN** un `Product` por pieza
- **WHEN** se registra un ingreso de 0, de un valor negativo o de 2,5 unidades
- **THEN** el servidor lo rechaza indicando la unidad esperada
- **AND** las existencias y el registro no cambian

#### Scenario: Una confirmación descuenta durante el ingreso (borde)

- **GIVEN** "Entrecot" con 4,000 kg
- **WHEN** se confirma un pedido de 1 kg y, a la vez, se registra un ingreso de 5 kg
- **THEN** las existencias terminan en 8,000 kg
- **AND** ambos movimientos quedan registrados con valores anterior y resultado coherentes entre sí

### Requirement: Reajuste por conteo físico con lo comprometido a la vista

El sistema SHALL permitir a `EMPLOYEE` y `ADMIN` reajustar las existencias de un `Product` a partir de la cantidad **contada físicamente** en el depósito. Antes de guardar, la interfaz SHALL mostrar las existencias actuales, lo comprometido hoy y el disponible resultante, calculado como cantidad contada − comprometido hoy.

El servidor SHALL recalcular lo comprometido en el momento de guardar, SHALL rechazar el reajuste si el disponible resultante es negativo, y SHALL rechazarlo también si las existencias almacenadas cambiaron desde que el usuario abrió el formulario. El motivo SHALL ser obligatorio. El reajuste SHALL registrar un `StockMovement` de tipo `COUNT_ADJUSTMENT` con la cantidad contada, lo comprometido, el valor anterior, la variación y el resultado, y SHALL recalcular el aviso de disponibilidad de las líneas en borrador del producto.

#### Scenario: El dueño cuenta la cámara

- **GIVEN** "Entrecot" con 5,000 kg disponibles y 1,500 kg comprometidos hoy
- **WHEN** el dueño anota 6,000 kg contados con el motivo "Merma por recorte"
- **THEN** la pantalla anticipa 4,500 kg disponibles (−0,500 kg)
- **AND** al guardar, las existencias quedan en 4,500 kg y se registra el `COUNT_ADJUSTMENT` con contado 6,000, comprometido 1,500, anterior 5,000 y variación −0,500

#### Scenario: Conteo inferior a lo comprometido (error)

- **GIVEN** 1,500 kg de entrecot comprometidos hoy
- **WHEN** se anotan 1,000 kg contados
- **THEN** el servidor rechaza el reajuste indicando que lo contado no cubre lo comprometido
- **AND** las existencias y el registro no cambian

#### Scenario: Se confirma un pedido mientras se cuenta (borde)

- **GIVEN** el dueño abrió el reajuste viendo 5,000 kg disponibles
- **WHEN** antes de guardar se confirma un pedido de 1 kg de entrecot
- **THEN** el reajuste se rechaza sin cambios
- **AND** la pantalla muestra los valores actualizados de disponible y comprometido para que el dueño vuelva a guardar

#### Scenario: Reajuste sin motivo (error)

- **GIVEN** un conteo válido
- **WHEN** se envía sin motivo
- **THEN** el servidor lo rechaza y no registra nada

### Requirement: Registro de movimientos de existencias

Toda variación de las existencias de un `Product` SHALL quedar registrada como un `StockMovement`, creado en la misma transacción que la variación, con el producto, el tipo (`INTAKE`, `COUNT_ADJUSTMENT` u `ORDER_CONFIRMED`), el `User` que la originó, el momento, el valor anterior, la variación y el valor resultante.

La confirmación de un `Order` SHALL registrar un `StockMovement` `ORDER_CONFIRMED` por cada `OrderItem` con producto, enlazado al `Order`. Si la confirmación se revierte por falta de existencias, ningún movimiento SHALL persistir. Para cada producto, el valor resultante del último movimiento SHALL coincidir con sus existencias almacenadas.

#### Scenario: El historial explica las existencias

- **GIVEN** "Entrecot" con un ingreso de +5 kg, una confirmación de −1,5 kg y un reajuste de −0,5 kg
- **WHEN** se abre su ficha
- **THEN** se ven los tres movimientos con usuario, momento, anterior, variación y resultado
- **AND** el resultado del más reciente coincide con las existencias mostradas

#### Scenario: Confirmación revertida por falta de existencias (error)

- **GIVEN** un `Order` con dos líneas, la segunda sin existencias suficientes
- **WHEN** se intenta confirmar
- **THEN** la confirmación se rechaza
- **AND** no se registra ningún `StockMovement`, tampoco el de la primera línea

#### Scenario: Línea sin producto asignado (borde)

- **GIVEN** un `Order` confirmado que conserva una mención sin reconocer y sin producto
- **WHEN** se registran sus movimientos
- **THEN** sólo las líneas con producto generan `StockMovement`
