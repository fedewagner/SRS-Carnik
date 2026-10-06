## MODIFIED Requirements

### Requirement: Recepción autenticada de mensajes entrantes

El sistema SHALL aceptar mensajes entrantes únicamente cuando la petición esté firmada por el proveedor, y SHALL rechazar cualquier petición cuya firma no valide, sin persistir nada ni disparar procesamiento posterior.

La verificación SHALL hacerse sobre la petición tal como el proveedor la firmó —la URL pública del endpoint, configurada de forma explícita, y los parámetros recibidos sin normalizar—, antes de interpretar su contenido, y SHALL usar comparación en tiempo constante. La URL contra la que se verifica SHALL NOT deducirse de cabeceras de la petición, que un intermediario puede alterar.

Si el sistema no tiene configuradas las credenciales del proveedor, SHALL rechazar toda petición entrante por ese canal: un endpoint sin secreto con el que verificar no se trata como un endpoint abierto.

**Datos personales:** el número y el nombre de perfil del remitente y el texto del mensaje sólo se persisten tras una verificación correcta. Los pueden leer los usuarios con rol `EMPLOYEE` o `ADMIN` desde el backoffice; ningún rol puede modificar un `Message` recibido. Los registros de rechazo SHALL NOT incluir el cuerpo de la petición, el número ni el texto.

#### Scenario: Mensaje entrante con firma válida

- **GIVEN** el proveedor envía un mensaje de texto de un cliente
- **WHEN** la firma de la petición valida contra el secreto de la cuenta y la URL pública configurada
- **THEN** el sistema registra un `Message` entrante asociado a su `Conversation`
- **AND** responde con éxito al proveedor dentro del plazo que este exige

#### Scenario: Firma inválida o ausente (error)

- **GIVEN** una petición dirigida al endpoint de entrada
- **WHEN** la firma falta, no valida, o algún parámetro fue alterado
- **THEN** el sistema rechaza la petición con un código de error de autorización
- **AND** no crea ningún `Customer`, `Conversation`, `Message` ni `Order`
- **AND** no invoca al proveedor de AI
- **AND** registra el rechazo sin incluir el cuerpo ni datos personales

#### Scenario: Canal sin credenciales configuradas (error)

- **GIVEN** el sistema desplegado sin el secreto de la cuenta del proveedor
- **WHEN** llega una petición al endpoint de entrada, con o sin firma
- **THEN** el sistema la rechaza sin intentar verificarla
- **AND** no crea ningún registro

#### Scenario: Petición firmada para otra URL (borde)

- **GIVEN** una petición con una firma válida calculada para una URL distinta de la configurada
- **WHEN** llega al endpoint de entrada, aunque sus cabeceras de reenvío indiquen la URL configurada
- **THEN** el sistema la rechaza con un código de error de autorización
- **AND** no crea ningún registro

#### Scenario: Entrega repetida del mismo mensaje (borde)

- **GIVEN** un mensaje ya procesado con un identificador de mensaje conocido
- **WHEN** el proveedor reintenta la entrega del mismo identificador
- **THEN** el sistema responde con éxito sin crear un `Message` duplicado
- **AND** no genera un segundo `Order` para el mismo mensaje
