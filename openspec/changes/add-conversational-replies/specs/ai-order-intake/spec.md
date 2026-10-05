## ADDED Requirements

### Requirement: Clasificación de la intención del mensaje

El sistema SHALL clasificar cada mensaje entrante que no se sume a un borrador abierto en una de cuatro intenciones: **pedido**, **saludo**, **consulta** o **repetir el último pedido**.

La clasificación SHALL obtenerse junto con la interpretación de las líneas, y SHALL resolverse también cuando el componente de AI no esté disponible, con el mecanismo determinista de respaldo.

**Ante la duda, pedido:** si la interpretación produce al menos una línea, el mensaje SHALL tratarse como pedido con independencia de la intención declarada. Un mensaje nunca SHALL dejar de generar borrador por haber sido clasificado como saludo o consulta si contiene una mención de producto o cantidad.

Todo mensaje entrante SHALL quedar registrado en la `Conversation`, visible para los roles `EMPLOYEE` y `ADMIN`, cualquiera sea su intención.

#### Scenario: Saludo sin pedido

- **GIVEN** un cliente sin borrador abierto
- **WHEN** escribe "hola, me gustaría hacer un pedido"
- **THEN** el sistema no crea ningún `Order`
- **AND** el mensaje queda registrado en la `Conversation`

#### Scenario: Saludo que incluye un pedido (borde)

- **GIVEN** un cliente sin borrador abierto
- **WHEN** escribe "hola! quiero 2 kg de entrecot"
- **THEN** el sistema crea un `Order` en borrador con la línea de entrecot
- **AND** no lo trata como un saludo

#### Scenario: El componente de AI no responde (error)

- **GIVEN** el proveedor de AI devuelve un error o agota el tiempo de espera
- **WHEN** llega un mensaje sin productos ni cantidades reconocibles
- **THEN** el mecanismo de respaldo lo clasifica como saludo
- **AND** el sistema no crea ningún `Order`

### Requirement: Repetición del último pedido confirmado

Cuando el cliente pide repetir su pedido habitual, el sistema SHALL crear un `Order` en borrador con los productos y cantidades de su **último `Order` confirmado**, valorados con los precios vigentes y contrastados con las existencias actuales, como cualquier borrador nuevo.

El sistema SHALL reconocer como pedido de repetición una expresión explícita («lo de siempre», «lo mismo», «repetí el último») y, además, una respuesta afirmativa breve («sí», «dale») sólo cuando el último mensaje enviado a ese cliente fue la sugerencia de repetir.

**Datos personales:** el historial de pedidos de un cliente sólo se usa dentro de su propia conversación. SHALL NOT enviarse al proveedor de AI. Lo leen los roles `EMPLOYEE` y `ADMIN` desde el backoffice; ningún rol lo modifica por esta vía.

#### Scenario: El cliente pide lo de siempre

- **GIVEN** un cliente cuyo último pedido confirmado fue de 2 kg de "Entrecot" y 6 "Salchicha Lyoner"
- **WHEN** escribe "lo de siempre por favor"
- **THEN** el sistema crea un `Order` en borrador con esas dos líneas y esas cantidades
- **AND** los importes se calculan con los precios vigentes, no con los del pedido anterior
- **AND** cada línea indica en su texto de origen que proviene de una repetición

#### Scenario: Pedido de repetición sin historial (error)

- **GIVEN** un cliente sin ningún pedido confirmado
- **WHEN** escribe "lo de siempre"
- **THEN** el sistema no crea ningún `Order`
- **AND** responde que no encuentra un pedido anterior y le pide que escriba qué quiere

#### Scenario: Afirmación suelta sin sugerencia previa (borde)

- **GIVEN** un cliente al que no se le ofreció repetir su pedido en su último mensaje recibido
- **WHEN** escribe "sí"
- **THEN** el sistema no crea ningún `Order` por repetición
- **AND** el mensaje queda registrado en la `Conversation` para atención humana

#### Scenario: Un producto del último pedido ya no está activo (borde)

- **GIVEN** un último pedido confirmado que incluye un producto hoy inactivo
- **WHEN** el cliente pide repetirlo
- **THEN** el borrador incluye sólo los productos activos
- **AND** el acuse indica qué producto no se pudo repetir
