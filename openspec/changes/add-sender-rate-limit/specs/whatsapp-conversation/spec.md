## MODIFIED Requirements

### Requirement: Límite de consumo por cliente

El sistema SHALL limitar la cantidad de mensajes entrantes que un mismo `Customer` puede provocar en una ventana de tiempo, para evitar que un remitente agote el presupuesto de AI o sature el backoffice. El límite SHALL evaluarse antes de invocar al proveedor de AI, con un máximo de mensajes y una duración de ventana fijados por configuración del sistema.

Cuentan para el límite los mensajes entrantes de la `Conversation` recibidos dentro de la ventana, salvo los que llegaron mientras la conversación tenía un pedido en borrador abierto. Por encima del límite, el sistema SHALL registrar el `Message`, SHALL NOT invocar al proveedor de AI ni crear un `Order` para ese mensaje, y SHALL enviar al cliente un aviso de texto fijo como máximo una vez por ventana.

**Datos personales:** el aviso se envía únicamente a la conversación del propio cliente y queda registrado como `Message` saliente, legible por los roles `EMPLOYEE` y `ADMIN` e inmutable. El sistema SHALL NOT escribir el número de teléfono ni el contenido del mensaje en los registros de diagnóstico al aplicar el límite.

#### Scenario: Cliente dentro del límite

- **GIVEN** un cliente que envió menos mensajes que el máximo dentro de la ventana
- **WHEN** envía un mensaje nuevo
- **THEN** el sistema lo procesa con normalidad

#### Scenario: Cliente que supera el límite (error)

- **GIVEN** un cliente que superó el límite de mensajes de la ventana
- **WHEN** envía un mensaje adicional
- **THEN** el sistema registra el `Message` pero no invoca al proveedor de AI
- **AND** no crea un `Order` nuevo para ese mensaje
- **AND** el empleado sigue viendo la conversación completa

#### Scenario: Aviso único por ventana (borde)

- **GIVEN** un cliente que superó el límite y ya recibió el aviso en la ventana actual
- **WHEN** envía otro mensaje dentro de la misma ventana
- **THEN** el sistema registra el `Message` sin invocar al proveedor de AI
- **AND** no le envía un segundo aviso

#### Scenario: Fin de la ventana (borde)

- **GIVEN** un cliente que superó el límite
- **WHEN** escribe de nuevo una vez transcurrida la ventana
- **THEN** el sistema procesa su mensaje con normalidad

#### Scenario: Aclaraciones sobre un pedido ya existente (borde)

- **GIVEN** un cliente con un pedido en borrador que responde varias veces seguidas a una pregunta del empleado
- **WHEN** esos mensajes llegan dentro de la ventana
- **THEN** el sistema los registra en la `Conversation` sin crear pedidos adicionales
- **AND** no los cuenta como intentos de pedido nuevo
