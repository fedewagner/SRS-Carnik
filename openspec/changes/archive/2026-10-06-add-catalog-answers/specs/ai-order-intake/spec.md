## MODIFIED Requirements

### Requirement: Clasificación de la intención del mensaje

El sistema SHALL clasificar cada mensaje entrante que no se sume a un borrador abierto en una de cuatro intenciones: **pedido**, **saludo**, **consulta** o **repetir el último pedido**. Para una consulta, SHALL identificar además los productos del catálogo activo por cuyo precio o disponibilidad se pregunta; un producto que no esté en el catálogo activo SHALL descartarse.

La clasificación y los productos consultados SHALL obtenerse junto con la interpretación de las líneas, y SHALL resolverse también cuando el componente de AI no esté disponible, con el mecanismo determinista de respaldo.

**Ante la duda, pedido:** si la interpretación produce al menos una línea, el mensaje SHALL tratarse como pedido con independencia de la intención declarada. Un mensaje nunca SHALL dejar de generar borrador por haber sido clasificado como saludo o consulta si contiene una cantidad o una expresión de pedido («mandame», «reservame», «para mañana»). La única mención de producto que SHALL NOT generar línea es una pregunta por su precio o disponibilidad sin cantidad ni expresión de pedido.

Todo mensaje entrante SHALL quedar registrado en la `Conversation`, visible para los roles `EMPLOYEE` y `ADMIN`, cualquiera sea su intención.

**Datos personales:** al proveedor de AI SHALL enviarse únicamente el texto del mensaje y el catálogo (nombres, identificadores y unidades), sin precios, existencias ni datos del cliente.

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

#### Scenario: Pregunta de precio sin cantidad

- **GIVEN** "Entrecot" activo en el catálogo
- **WHEN** el cliente escribe "¿a cuánto está el entrecot?"
- **THEN** el mensaje se clasifica como consulta con el producto "Entrecot" consultado
- **AND** no se produce ninguna línea de pedido

#### Scenario: Pregunta con cantidad o expresión de pedido (borde)

- **GIVEN** "Entrecot" activo en el catálogo
- **WHEN** el cliente escribe "¿tienen 2 kg de entrecot?" o "¿tenés entrecot para mañana?"
- **THEN** el sistema crea un `Order` en borrador con la línea de entrecot

#### Scenario: Producto consultado fuera del catálogo activo (error)

- **GIVEN** el componente de AI identifica como consultado un producto inexistente o inactivo
- **WHEN** el sistema valida la salida
- **THEN** descarta ese producto
- **AND** si no queda ninguno, el mensaje se trata como una consulta sin productos

#### Scenario: El componente de AI no responde (error)

- **GIVEN** el proveedor de AI devuelve un error o agota el tiempo de espera
- **WHEN** llega un mensaje sin productos ni cantidades reconocibles
- **THEN** el mecanismo de respaldo lo clasifica como saludo
- **AND** el sistema no crea ningún `Order`
