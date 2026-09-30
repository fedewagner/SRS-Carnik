# conversational-catalog

## Purpose

Responde automáticamente a preguntas simples del cliente sobre disponibilidad y precio de un producto, para que las consultas triviales no generen trabajo en el mostrador ni un pedido en borrador que alguien tenga que descartar a mano.

> **SHOULD-HAVE.** Esta capacidad **no forma parte del flujo E2E prioritario** y se implementa únicamente si sobra presupuesto. Ninguna capacidad must-have depende de ella: si cae, el flujo sigue completo y demostrable. Al caer, las preguntas simples quedan en la conversación para que un empleado las responda a mano, que es exactamente el comportamiento sin esta capacidad.

## ADDED Requirements

### Requirement: Respuesta automática a consultas de catálogo

El sistema SHALL reconocer los mensajes entrantes que son una consulta sobre disponibilidad o precio de un producto y no una intención de pedido, y SHALL responder con la información del catálogo sin crear un `Order`.

El filtro previo de intención de `ai-order-intake` SHALL ejecutarse también sin esta capacidad; esta capacidad añade únicamente la respuesta para `CATALOG_QUERY`.

La respuesta SHALL construirse a partir de los datos del `Product` en la base de datos, nunca a partir de texto generado libremente sobre precios o cantidades.

**Datos personales:** la respuesta SHALL contener únicamente datos de `Product`. SHALL NOT revelar pedidos, historiales, ni información de otros clientes, aunque el mensaje entrante los mencione.

#### Scenario: Consulta simple de precio

- **GIVEN** un catálogo con el producto "Entrecot" activo y con precio vigente
- **WHEN** el cliente escribe "¿a cuánto está el entrecot?"
- **THEN** el sistema responde con el precio vigente del producto
- **AND** no crea ningún `Order`
- **AND** registra pregunta y respuesta en la `Conversation`

#### Scenario: Consulta sobre un producto desconocido (error)

- **GIVEN** el cliente pregunta por un producto que no está en el catálogo
- **WHEN** el sistema procesa el mensaje
- **THEN** responde que no dispone de esa información sin inventar un precio ni sugerir un sustituto
- **AND** la conversación queda visible para que un empleado responda si quiere

#### Scenario: Mensaje que mezcla consulta y pedido (borde)

- **GIVEN** el cliente escribe "¿a cuánto está el entrecot? mandame 2 kg"
- **WHEN** el sistema procesa el mensaje
- **THEN** prevalece la intención de pedido y se genera el `Order` en borrador
- **AND** no se envía una respuesta automática de catálogo además del acuse de recepción

#### Scenario: La clasificación no es concluyente (borde)

- **GIVEN** un mensaje cuya intención el sistema no puede determinar con confianza
- **WHEN** se procesa
- **THEN** el sistema no responde automáticamente ni crea un `Order`
- **AND** el mensaje queda en la `Conversation` para atención humana
