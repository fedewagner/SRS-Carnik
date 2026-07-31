# Bootstrap Carnik — Fundación del MVP

## Why

Una carnicería PyME suiza ya recibe pedidos por WhatsApp, pero ese canal vive en el teléfono personal del dueño: los pedidos se anotan a mano, interrumpen la atención al mostrador y no están conectados con lo que hay en la cámara. El resultado son pedidos perdidos, productos prometidos que no hay, y un dueño que no puede delegar el canal.

Carnik no reemplaza el canal —el cliente sigue escribiendo por WhatsApp como siempre— sino que lo convierte en trabajo estructurado para el mostrador. Este change levanta el MVP desde cero hasta el flujo E2E completo desplegado en una URL pública.

## What Changes

Proyecto nuevo, sin código previo. Se introduce exactamente lo que sostiene el flujo E2E y nada más:

- **Ingesta bidireccional de WhatsApp.** El webhook de Meta Cloud API y un simulador interno desembocan en la misma función de ingesta; el dominio nunca conoce al proveedor. El simulador es lo que permite que el test E2E corra sin red externa ni credenciales.
- **Propuesta de pedido asistida por AI.** El texto libre del cliente se interpreta contra el catálogo y la disponibilidad vigente y produce un pedido en borrador. La AI propone; el servidor recalcula precios y disponibilidad contra la base. El modelo nunca escribe estado.
- **Backoffice de confirmación rápido.** El empleado ve el borrador junto a la conversación, ajusta líneas y confirma. La confirmación es una única transacción que cambia el estado y descuenta existencias.
- **Mensajería saliente por el mismo chat.** Acuse automático de recepción, mensaje manual del empleado cuando hace falta aclarar algo, y resumen al confirmar.
- **Vista de armado**, que es la misma consulta del backoffice filtrada por pedidos confirmados.
- **Infraestructura de entrega:** esquema Prisma sobre PostgreSQL, pipeline de CI con tests unitarios, de integración y un E2E, y despliegue en Railway con URL pública.

### Impacto visible para el usuario

- **Cliente:** escribe como siempre y recibe un acuse inmediato en vez de silencio, y después una confirmación con el detalle y el total. No instala, no se registra, no aprende nada nuevo.
- **Empleado:** deja de transcribir pedidos. Abre una lista, ve el borrador ya armado con los avisos de disponibilidad, ajusta lo que haga falta y confirma con un botón.
- **Dueño:** el canal deja de depender de su teléfono y de su memoria. Cada pedido queda trazado desde el mensaje original hasta la confirmación, y las existencias se descuentan solas.

### Decisiones de recorte tomadas en esta propuesta

Dos cláusulas del flujo E2E no aparecían en la lista de capacidades must-have. Resolución acordada, con el coste que evita cada una:

- **Existencias sin capacidad propia.** `Product` lleva un campo de cantidad disponible, sembrado, ajustable únicamente desde la línea del pedido donde el empleado detecta la discrepancia — que es exactamente cuando un carnicero se entera de que el stock está mal. **Se evita** una entidad `StockItem`, una ruta `/admin/products` y un CRUD completo. Preserva las dos cláusulas del flujo: propuesta anclada en disponibilidad, y descuento atómico al confirmar.
- **La pantalla del local no es una superficie nueva.** `/dashboard` reusa la consulta del backoffice filtrando por pedidos confirmados. **Se evita** una capacidad, un spec y un layout propio.

### Fuera de alcance (explícito)

Estas exclusiones son decisiones, no omisiones. Cada una añadiría al menos una entidad, un servicio o una integración que el flujo E2E no necesita:

- **Pagos y cobros.** Abrirían alcance PCI y duplicarían el proyecto.
- **Logística, reparto y horarios de retiro.** El pedido se confirma; cómo se entrega queda fuera.
- **Gestión de catálogo por UI.** Los productos se siembran. Un CRUD de productos no aparece en ninguna cláusula del flujo.
- **Historial y analítica de operaciones.** Ningún dashboard de métricas, ningún informe.
- **Website pública.** No está en el flujo ni en las capacidades.
- **Adjuntos.** Fotos y notas de voz se rechazan pidiendo texto. Elimina toda la categoría de riesgo de descarga de media de terceros.
- **Multilingüe.** Se fija un solo idioma de atención como supuesto explícito.
- **Pausar el bot durante la intervención humana.** El empleado puede escribir en la conversación, pero no hay control de presencia ni de turno.
- **Notificaciones push, WebSockets y realtime.** La notificación al empleado es polling con badge.
- **Alta de la cuenta de WhatsApp de producción.** Se usa el número de prueba de Meta: la verificación de negocio requiere entidad legal y semanas de espera.
- **Multi-tenant.** El sistema modela una carnicería, no una plataforma.

## Capabilities

### New Capabilities

**Must-have** — las tres sostienen el flujo E2E y ninguna es prescindible:

- `whatsapp-conversation`: integración bidireccional con WhatsApp. Recepción autenticada de mensajes entrantes desde Meta Cloud API y desde el simulador interno, identidad del cliente por su número, historial de conversación, y envío saliente —acuse automático, mensaje manual del empleado y resumen de confirmación— por el mismo canal.
- `ai-order-intake`: transformación del texto libre del cliente en un pedido estructurado, anclado al catálogo y a la disponibilidad vigente, con precios y disponibilidad recalculados en servidor. Incluye la implementación determinista de respaldo y el aislamiento frente a instrucciones embebidas en el mensaje.
- `order-confirmation`: backoffice de revisión. Notificación de pendientes, listado, detalle con la conversación, ajuste de líneas y de existencias, y confirmación transaccional que cambia el estado y descuenta stock de forma atómica. Incluye la vista de armado como proyección filtrada de la misma consulta.

**Should-have** — solo si sobra presupuesto; su spec está marcado como tal y ninguna otra capacidad depende de él:

- `conversational-catalog`: respuesta automática a preguntas simples del cliente sobre disponibilidad y precio de un producto, sin generar pedido. **No forma parte del flujo E2E**: si cae, el flujo sigue completo y demostrable.

### Modified Capabilities

Ninguna. El proyecto arranca desde cero y no hay specs previos en `openspec/specs/`.

## Seguridad desde el diseño

### Datos personales y sensibles que maneja el flujo

| Dato | Origen | Sensibilidad |
|---|---|---|
| Número de teléfono en formato E.164 | WhatsApp, identifica al cliente | Dato personal directo. Es el identificador principal del `Customer`. |
| Nombre de perfil de WhatsApp | WhatsApp | Dato personal. No verificado — el cliente lo elige. |
| Contenido de los mensajes | Cliente y empleado | Dato personal. Puede contener direcciones, horarios y hábitos de consumo que el cliente escribe por su cuenta. |
| Historial de pedidos y su detalle | Derivado | Dato personal por asociación: revela hábitos de compra vinculados a una persona identificada. |
| Credenciales de acceso al backoffice | Sembradas | Secreto. Solo hash, nunca en claro. |
| Tokens de Meta y del proveedor de AI | Configuración | Secreto de infraestructura. Solo en variables de entorno. |

Marco aplicable: **nLPD/revDSG suiza**, y GDPR si hay clientes de la UE. El sistema **no maneja** datos de pago, documentos de identidad, ni categorías especiales de datos — y las exclusiones de alcance están diseñadas para que siga siendo así.

### Roles y qué puede hacer cada uno

| Rol | Es | Puede |
|---|---|---|
| `ADMIN` | Dueño de la carnicería | Todo lo del rol `EMPLOYEE`, más modificar los datos identificativos de un `Customer`. |
| `EMPLOYEE` | Personal de mostrador y obrador | Leer pedidos, conversaciones y clientes; editar líneas de un pedido en borrador; ajustar existencias de un producto; confirmar pedidos; escribir mensajes al cliente; ver la cola de armado. |
| *Anónimo* | Visitante, o el webhook de Meta | Nada que exponga datos. Solo dos superficies: el endpoint del webhook —que no lee, solo escribe tras verificar firma— y la pantalla de login. |

El **cliente de WhatsApp no es un rol del sistema**: no tiene cuenta, no se autentica y no ve ninguna pantalla. Su número de teléfono es un identificador, **nunca una credencial**. Cualquier persona con un teléfono puede escribir; por eso ningún mensaje entrante produce por sí solo un efecto irreversible, y la confirmación humana es el control compensatorio.

### Autenticación y autorización por operación

**Requieren estar autenticado con rol `EMPLOYEE` o `ADMIN`** — toda lectura o escritura de datos del backoffice: listar pedidos, consultar pendientes, ver el detalle y su conversación, ver la cola de armado.

**Requieren además autorización sobre el recurso concreto**, comprobada en el servidor en la misma operación que escribe:

| Operación | Condición sobre el recurso |
|---|---|
| Editar, añadir o eliminar una línea | El `Order` debe estar en estado `DRAFT`. Un pedido confirmado es inmutable. |
| Confirmar un pedido | El `Order` debe estar en `DRAFT`, y **cada** línea debe tener existencias suficientes en el momento de confirmar, no cuando se generó el borrador. |
| Ajustar existencias de un producto | El `Product` debe estar activo, y la cantidad debe ser válida para su unidad de venta. |
| Enviar un mensaje manual | La `Conversation` debe existir. Un `Message` ya enviado es inmutable para todos los roles. |
| Modificar datos identificativos de un `Customer` | Rol `ADMIN` exclusivamente. |
| Usar el canal de simulación | Rol `EMPLOYEE` o `ADMIN`, **y** el canal habilitado por configuración. |

**No requieren autenticación, y por eso llevan su propio control:** el `POST` del webhook, autorizado por firma HMAC sobre el cuerpo crudo con comparación en tiempo constante, e idempotente por identificador de mensaje; y el `GET` de handshake, autorizado por un token de verificación compartido.

**Principio transversal:** la comprobación de rol y de estado del recurso ocurre **dentro de cada route handler y de cada server action**, nunca solo en middleware ni ocultando controles en la interfaz. Los Server Actions de Next.js son endpoints HTTP públicos aunque el botón no se vea.

## Supuestos declarados

Cada uno afecta al diseño. Si alguno es falso, decímelo antes de implementar.

1. **Una sola carnicería, un solo idioma de atención.** Ni multi-tenant ni multilingüe. El dialecto suizo-alemán frente al alemán estándar es un problema real de producto que no entra en el presupuesto.
2. **El catálogo se siembra y cambia poco.** Sin CRUD de productos: un carnicero no da de alta productos nuevos a diario, y el flujo E2E no lo requiere.
3. **Dos cuentas sembradas, sin autorregistro ni recuperación de contraseña.** El personal de una PyME de 2 a 6 personas no necesita gestión de usuarios.
4. **Un pedido por conversación a la vez.** Mientras hay un borrador abierto, los mensajes siguientes del cliente se suman a esa conversación en vez de crear un segundo pedido.
5. **La confirmación ocurre el mismo día que el mensaje.** La ventana de 24 h de WhatsApp para mensajes libres se respeta de forma natural en una carnicería; fuera de ella, el resumen falla de forma controlada y el pedido sigue confirmado.
6. **El número de prueba de Meta basta para la demo.** El sistema es grado-demo en el canal, no en el dominio.
7. **Precios en CHF, sin IVA desglosado ni ofertas.** El precio del producto es el precio final de la línea.

## Impact

- **Código:** proyecto Next.js 15 (App Router) nuevo. Dos rutas de API de entrada, una de polling, server actions para el backoffice, y el módulo de dominio agnóstico del proveedor entre ambos.
- **Datos:** esquema Prisma nuevo sobre PostgreSQL. Siete entidades: `User`, `Product` (con la cantidad disponible como campo, no como tabla aparte), `Customer`, `Conversation`, `Message`, `Order`, `OrderItem`.
- **Dependencias externas:** Meta WhatsApp Cloud API (número de prueba, token permanente vía System User) y un proveedor de LLM detrás de una interfaz reemplazable con respaldo determinista.
- **Infraestructura:** Railway con PostgreSQL gestionado, migraciones en el despliegue, y URL pública que además es el destino del webhook.
- **CI/CD:** pipeline con lint, typecheck, tests unitarios, tests de integración contra una base efímera y un E2E contra el simulador.
- **Presupuesto:** **28 tareas** must-have. Estimación ascendente por grupos: ~19,5 h. Contrastada contra una banda de 45–90 min por tarea: **21 – 42 h**. Entra en el suelo de la banda con ~1 h de margen; **no entra en el techo bajo ningún recorte que preserve el flujo**, y de ahí el orden de caída de abajo. La capacidad should-have son 2 tareas más y solo se implementa si el colchón sobrevive.

## Orden de caída pre-comprometido

Si el proyecto corre hacia el techo de la banda, esta es la secuencia de recorte, decidida ahora y en frío. Cada escalón sacrifica una cláusula del flujo E2E, en orden creciente de dolor. **No se improvisa un recorte distinto sobre la marcha.**

| # | Qué cae | Qué se pierde | Qué sobrevive |
|---|---|---|---|
| 1 | `conversational-catalog` (should-have) | Nada del flujo | Todo el flujo E2E |
| 2 | Cola de armado (`/dashboard`) | La última cláusula: *"aparece en la pantalla del local"* | El empleado arma desde el backoffice |
| 3 | Integración real con Meta (queda el simulador) | *"escribe al WhatsApp de la carnicería"* pasa a ser simulado | Todo el sistema, demostrable de punta a punta |
| 4 | `LlmOrderDrafter` (queda el determinista) | *"lo interpreta con AI"* — el diferenciador | Un sistema que funciona, sin la parte interesante |

El escalón 3 es la mayor palanca disponible (~2–3 h) y a la vez el que más daña la premisa del producto. Que sea así es el diagnóstico: **el alcance ya no tiene grasa, lo que queda por recortar es músculo.** Si hace falta llegar al escalón 4, la conclusión correcta no es recortar más sino mover la fecha.
