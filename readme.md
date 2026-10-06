# Carnik

Pedidos por WhatsApp para carnicerías, redactados por AI y confirmados por una persona.

---

## 0. Ficha del proyecto

| | |
|---|---|
| **Nombre del producto** | Carnik |
| **Autor** | Federico J. Wagner |
| **Contexto** | Proyecto final AI4Devs |
| **Repositorio** | https://github.com/fedewagner/SRS-Carnik |
| **URL de la demo** | https://srs-carnik-production.up.railway.app · las credenciales de prueba se entregan por el formulario, no en el repositorio público |
| **Stack** | Next.js 15 (App Router) · Prisma 6 · PostgreSQL 16 · Claude API · Railway |
| **Alcance** | Piso de 17 tareas más nueve incrementos, cada uno con su change de OpenSpec · 16 de 17 historias entregadas · ver la tabla de abajo |
| **Estado** | Flujo E2E desplegado y funcionando por WhatsApp real. 214 tests y dos E2E en verde en CI |

Todo el documento describe el sistema implementado y desplegado. Donde el diseño de la Entrega 1 se cambió —sobre todo el paso de Meta a Twilio— se indica el motivo. La especificación versionada vive en `openspec/`: las specs vivas en `openspec/specs/` (cinco capacidades) y la historia de cada cambio en `openspec/changes/archive/`, con `bootstrap-carnik` y un change por incremento. Las decisiones que el código no explica están en `docs/adr/`, y las instrucciones del agente en `CLAUDE.md`.

### Alcance entregado frente a especificado

La entrega se adelantó a dos días de trabajo sin código escrito. El plan de 28 tareas (~20 h) no entraba, así que se replanificó a un **piso de 17 tareas (~10 h)** ejecutando el orden de caída pre-comprometido del `proposal.md` hasta el escalón 3. Lo que no está es una decisión registrada en `tasks.md`, no una omisión. Con el piso desplegado se sumaron nueve incrementos, cada uno como change propio de `openspec/` y un PR:

| Change | Historia |
|---|---|
| `add-whatsapp-twilio-channel` | `US-01`, `US-11` · WhatsApp real |
| `add-order-line-adjustment` | `US-08` |
| `add-conversational-replies` | Saludo, consulta y «lo de siempre» |
| `add-sender-rate-limit` | `US-03` |
| `add-pending-badge` | `US-07` (badge) |
| `add-manual-customer-message` | `US-12` |
| `add-assembly-dashboard` | `US-13` |
| `add-catalog-answers` | `US-14` |
| `add-catalog-management` | `US-15` |

| Historia | Qué es | Estado |
|---|---|:-:|
| `US-06` | Login con rol y sesión de 8 h | ✅ |
| `US-02` | Simulador de mensajes entrantes | ✅ |
| `US-04a` | Interpretación determinista del pedido | ✅ |
| `US-04b` | Interpretación con AI y caída al determinista | ✅ |
| `US-05` | Valoración en servidor contra catálogo y existencias | ✅ |
| `US-07` | Listado, detalle con la conversación y badge de pendientes | ✅ · el badge se refresca cada 10 s |
| `US-10` | Confirmación transaccional que descuenta existencias | ✅ |
| `US-11` | Acuse al recibir y resumen al confirmar | ✅ · llegan al WhatsApp del cliente |
| `US-01` | Recibir pedidos por WhatsApp | ✅ · vía **Twilio WhatsApp Sandbox**, no Meta (ver §2.4) |
| `US-08` | Ajustar, eliminar y añadir líneas del borrador | ✅ · más asignación manual de producto a menciones sin reconocer y columna de stock disponible |
| — | Respuestas según la intención: saludo, consulta y «lo de siempre» | ✅ · change `add-conversational-replies` |
| `US-03` | Límite de mensajes por remitente | ✅ · 10 cada 10 min; por encima se registra sin invocar a la AI |
| `US-15` | Catálogo: alta de producto, precio, ingreso y reajuste de existencias con libro de movimientos | ✅ · el cambio de precio revalora los borradores; el reajuste descuenta lo comprometido hoy |
| `US-09` | Corrección de existencias desde la línea | ↪ reemplazada por el reajuste de `US-15` |
| `US-12` | Mensaje manual del empleado o del admin | ✅ · atribuido a quien lo escribe |
| `US-13` | Cola de armado en `/dashboard` | ✅ · confirmados de hoy, sin datos personales del cliente |
| `US-14` | Respuesta automática a consultas de precio y disponibilidad | ✅ · reincorporada como Could (ver §5) |
| `US-16` | Venta sugerida (*upsell*) desde el detalle del pedido | ⏭ Could, anotada al especificar `US-15` |

---

## 1. Descripción general del producto

### 1.1 Objetivo

Carnik convierte el WhatsApp de una carnicería de barrio en un canal de pedidos conectado con la cámara. Está hecho para una PyME suiza de dos a seis personas donde el dueño ya recibe pedidos por WhatsApp en su teléfono personal, los anota a mano entre cliente y cliente, y descubre a media mañana que prometió un entrecot que ya no tiene. El cliente escribe como siempre —sin instalar nada, sin registrarse, sin aprender nada nuevo— y el mostrador recibe un pedido ya estructurado, valorado con los precios reales y contrastado con las existencias del día. La persona que atiende deja de transcribir y pasa a revisar: ajusta lo que haga falta, confirma con un botón, y el stock se descuenta solo.

La alternativa actual no es "no tener canal digital" —ya lo tienen, es WhatsApp— sino un cuaderno o una hoja de Excel al lado del teléfono. Y ahí está la diferencia: **una hoja de cálculo no sabe qué queda en la cámara en el momento de confirmar, no le contesta al cliente, y obliga a alguien a teclear cada pedido dos veces.** El email tampoco sirve, porque exige que el cliente cambie de hábito, y no lo va a hacer: escribe por WhatsApp porque es donde ya está. Carnik no le pide nada al cliente y le quita trabajo al mostrador, que es exactamente el reparto de esfuerzo que ni el Excel ni el email consiguen. Y mantiene el control donde tiene que estar: **ningún pedido llega al obrador sin que una persona lo haya confirmado.**

#### Flujo de principio a fin

```mermaid
flowchart LR
    C1["Cliente escribe su pedido<br/>en lenguaje natural"] --> S1
    S1["Interpreta el mensaje contra<br/>catálogo y existencias"] --> S2
    S2["Crea el borrador con precios<br/>de servidor y avisa al mostrador"] --> E1
    E1["Empleado revisa líneas<br/>y avisos de disponibilidad"] --> E2
    E2["Responde al cliente por el<br/>mismo chat si hace falta"] --> E3
    E3["Confirma el pedido"] --> S3
    S3["Descuenta existencias en<br/>la misma transacción"] --> S4
    S4["Envía el resumen y muestra<br/>el pedido en la pantalla del local"]

    subgraph Leyenda [" "]
        direction LR
        L1["Lo hace una persona"]
        L2["Lo hace el sistema"]
    end

    classDef persona fill:#fde8d7,stroke:#c2410c,stroke-width:2px,color:#7c2d12
    classDef sistema fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#1e3a8a
    class C1,E1,E2,E3,L1 persona
    class S1,S2,S3,S4,L2 sistema
```

Los cuatro pasos en naranja son los únicos que consumen atención de una persona, y sólo uno de ellos —responder para aclarar algo— es opcional. Todo lo azul ocurre solo.

### 1.2 Características y funcionalidades principales

Cada funcionalidad participa en el flujo de arriba o lo sostiene.

#### Must-Have

**1. Conversación bidireccional por WhatsApp**
Recibe los mensajes que el cliente envía al número de la carnicería —hoy, el sandbox de WhatsApp de Twilio— y devuelve por el mismo chat el acuse con lo anotado, las respuestas que escribe el personal y el resumen final del pedido. Incluye un **canal de simulación interno** que produce el mismo efecto sin depender del proveedor, y que permite desarrollar, probar en CI y demostrar el producto sin credenciales.
*Por qué es imprescindible:* es el primer paso y el último del flujo. Sin la ida no hay pedido que interpretar, y sin la vuelta el cliente se queda sin saber si su pedido existe — que es exactamente el problema que veníamos a resolver.

**2. Interpretación del pedido con AI**
Convierte el texto libre del cliente en un pedido estructurado, resolviendo cada mención contra el catálogo y marcando las líneas que superan lo disponible; los precios y la disponibilidad los recalcula siempre el servidor, nunca el modelo. Clasifica además la intención del mensaje: un saludo no abre un pedido vacío, sino que recibe una invitación y, si el cliente ya compró, la oferta de repetir **«lo de siempre»**.
*Por qué es imprescindible:* es el paso que elimina la transcripción manual. Sin él, el empleado recibe un mensaje de texto y volvemos al cuaderno; y sin el anclaje al catálogo y a la cámara, la propuesta sería una promesa que el mostrador no puede sostener.

**3. Backoffice de confirmación**
Muestra el borrador junto a la conversación que lo originó, permite ajustar cantidades, eliminar o añadir líneas y asignar un producto a lo que la AI no reconoció, y confirma el pedido descontando el stock en una única transacción. Desde el mismo detalle se le escribe al cliente. Un badge en la navegación avisa de los pedidos pendientes, y la **pantalla del local** muestra los confirmados del día para armarlos.
*Por qué es imprescindible:* es el control humano que hace que el sistema sea confiable, y el único punto donde el pedido se vuelve real. Sin la confirmación transaccional, dos personas confirmando a la vez dejarían el stock en negativo.

**4. Catálogo con libro de existencias**
El dueño da de alta productos y cambia precios —que revaloran los borradores abiertos—; el personal registra lo envasado y reajusta el stock tras contar la cámara. Cada movimiento queda en un libro con quién, cuándo y por qué.
*Por qué es imprescindible:* sin él, el stock sólo baja con cada confirmación y en pocos días deja de parecerse a lo que hay en la cámara; con él dejan de tener sentido los avisos de disponibilidad.

#### Should-Have y Could

**5. Límite de consumo por cliente.** 10 mensajes cada 10 minutos; por encima, el mensaje se registra pero no se invoca a la AI. Protege el coste del webhook público.

**6. Catálogo conversacional.** Responde a preguntas simples de precio o disponibilidad con datos de la base —nunca texto redactado por la AI—, sin crear pedido. Era Could-Have; se reincorporó con la regla de que un mensaje con cantidad o expresión de pedido sigue siendo pedido (§5).

### 1.3 Diseño y experiencia de usuario

Recorrido completo con el intérprete de AI activo (Claude API) y la interfaz final del backoffice. Las capturas se generan con `scripts/capture-screenshots.mjs`, que recorre el flujo con Playwright sobre una base recién sembrada; el mismo recorrido está desplegado en https://srs-carnik-production.up.railway.app.

**1 · Acceso.** No hay registro: el personal entra con las cuentas sembradas. Toda pantalla del backoffice redirige aquí sin sesión.

![Login](docs/screenshots/01-login.png)

**2 · El cliente escribe.** El simulador reproduce el mensaje que llegaría por WhatsApp y entra por la misma función de ingesta que el webhook de Twilio. La respuesta muestra el borrador ya valorado: la AI resolvió «un kilo y medio» y «medio de picada», y dejó el cordero —que no está en el catálogo— como mención sin reconocer en vez de inventar un producto.

![Simulador con el borrador resultante](docs/screenshots/02-simulador-borrador.png)

**3 · El empleado revisa.** Una sola pantalla: líneas con el texto original del cliente debajo, precios de la base, aviso cuando una línea supera lo disponible y la conversación al lado. La cabecera indica si el borrador lo propuso la AI o el intérprete por reglas.

![Detalle del borrador](docs/screenshots/03-detalle-borrador.png)

**4 · Confirma.** Un botón. Las existencias se descuentan en la misma transacción y el resumen al cliente queda registrado en la conversación. Si alguna línea supera el stock en el momento de confirmar, la respuesta es un `409` que señala la línea y no se modifica nada.

![Pedido confirmado con el resumen al cliente](docs/screenshots/04-detalle-confirmado.png)

**5 · Listado.** Pendientes primero. El badge rojo de la navegación cuenta los borradores por confirmar y se refresca solo cada 10 s, en todas las pantallas (`US-07`).

![Listado de pedidos](docs/screenshots/05-listado.png)

**6 · Corrección antes de confirmar (`US-08`).** En borrador, cada cantidad se edita en su línea y cada línea se puede eliminar; abajo se añaden productos del catálogo. A una mención que la AI no reconoció —aquí «2 kg de cordero», que no está en el catálogo— se le asigna un producto con el desplegable, conservando el texto original. La columna **Stock disponible** muestra las existencias actuales, que ya descuentan los pedidos confirmados, y se marca en rojo cuando la línea las supera.

![Línea sin reconocer y stock disponible](docs/screenshots/06-linea-sin-reconocer.png)

**7 · Consultas de precio (`US-14`).** «¿A cuánto está el entrecot y tienen costillas?» no abre un pedido: recibe los precios de hoy y la disponibilidad —sólo «hay» o «no nos queda», nunca una cantidad— leídos de la base, con la aclaración de que preguntar no reserva.

![Respuesta automática a una consulta de precio](docs/screenshots/07-consulta-precio.png)

**8 · La conversación completa y el mensaje manual (`US-12`).** Un mismo hilo con la consulta, la respuesta con precios, el pedido, el acuse con lo anotado, el resumen al confirmar y un mensaje escrito a mano por el admin, atribuido a quien lo envió. El cuadro «Escribir al cliente» funciona sobre borradores y confirmados, y si Twilio rechaza el envío el mensaje queda marcado como fallido.

![Conversación con mensaje manual](docs/screenshots/08-mensaje-manual.png)

**9 · Pantalla del local (`US-13`).** Los pedidos confirmados hoy, del más antiguo al más reciente, en letra grande para leer desde el obrador. No muestra teléfonos ni conversaciones: la consulta ni siquiera los pide a la base. Se refresca cada 20 s y, si falla, conserva lo último y avisa que está desactualizada.

![Cola de armado](docs/screenshots/09-cola-de-armado.png)

**10 · Catálogo (`US-15`).** Precio, disponible y lo comprometido hoy en pedidos confirmados, con aviso de agotado. Sólo el `ADMIN` da de alta productos y cambia precios.

![Catálogo](docs/screenshots/10-catalogo.png)

**11 · Ficha de producto.** Cambio de precio, que revalora los borradores abiertos; ingreso de lo envasado; reajuste por conteo físico con motivo obligatorio; y el libro de movimientos, donde cada confirmación de pedido aparece con su referencia.

![Ficha de producto con libro de existencias](docs/screenshots/11-ficha-producto.png)

#### Qué responde el chat

La AI clasifica cada mensaje en la misma llamada que interpreta el pedido; el texto que recibe el cliente sale siempre de plantillas con datos de la base, nunca redactado por el modelo.

| El cliente escribe | Responde Carnik | ¿Crea pedido? |
|---|---|:-:|
| «Hola, quiero hacer un pedido» | «¡Hola Anna! ¿Qué te preparamos hoy?» con un ejemplo. Si ya compró antes: «¿Lo de siempre? 2 kg Entrecot y 6 u. Salchicha Lyoner. Respondé «sí» y lo anotamos» | No |
| «Sí» después de esa sugerencia, o «lo de siempre» | Repite el último pedido confirmado **a precios y stock de hoy** y lo enumera | Sí |
| «2 kg de entrecot y 2 kg de cordero» | «Anotamos: 2 kg Entrecot. Revisamos a mano: «2 kg de cordero»» — sin precios | Sí |
| «¿A cuánto está el entrecot?» | Precio de hoy y si hay disponible, desde la base; aclara que no reserva | No |
| «¿Abren el sábado?» | «Una persona del equipo te responde en breve» | No |
| Más de 10 mensajes en 10 minutos | Un único aviso por ventana; los mensajes quedan registrados sin invocar a la AI | No |
| Una foto o un audio | Pide el pedido por escrito, sin descargar el adjunto | No |

**Ante la duda, pedido:** si el mensaje trae una cantidad o una expresión de pedido («mandame», «para mañana», «quiero»), se abre un borrador aunque la AI lo haya clasificado como saludo o consulta. Así una mala clasificación nunca pierde una venta en silencio, que fue el motivo por el que la `US-14` había salido del MVP. La única excepción, decidida al reincorporarla: una pregunta de precio sin cantidad ni expresión de pedido («¿tenés entrecot?») recibe la respuesta con precios y una invitación a pedir, en vez de un borrador de 1 unidad.

#### Probarlo desde WhatsApp

El canal real usa el **sandbox de WhatsApp de Twilio**, que admite a cualquier teléfono que se una con un código:

1. Desde WhatsApp, enviar `join <código-del-sandbox>` al **+1 415 523 8886**. El código se entrega junto con las credenciales de la demo.
2. Escribir un pedido en lenguaje natural, por ejemplo *«Para mañana quiero 1 kg de entrecot y 4 hamburguesas»*. Llega al instante un acuse de recepción.
3. En el backoffice el pedido aparece como borrador, interpretado con AI. Al confirmarlo, el resumen con las líneas y el total llega al mismo chat.

La unión al sandbox caduca tras un tiempo sin actividad; basta con volver a enviar el `join`. El simulador sigue disponible como canal alternativo y es el que usan los tests.

### 1.4 Instrucciones de instalación

#### Requisitos previos

| Requisito | Versión / nota |
|---|---|
| Node.js | 22 (la que usa CI); 20 LTS también funciona |
| Docker | Para PostgreSQL 16 local. Vale cualquier PostgreSQL 16 accesible |
| API key de Anthropic | Opcional. Con `ORDER_DRAFTER=rules` el sistema funciona entero sin ella |

#### Puesta en marcha

```bash
git clone https://github.com/fedewagner/SRS-Carnik.git && cd SRS-Carnik
npm install                      # también ejecuta prisma generate
```

```bash
# PostgreSQL local en el puerto 54329, con una base para desarrollo y otra para tests
docker run -d --name carnik-pg -e POSTGRES_USER=carnik -e POSTGRES_PASSWORD=carnik \
  -e POSTGRES_DB=carnik -p 54329:5432 postgres:16-alpine
docker exec carnik-pg psql -U carnik -c "CREATE DATABASE carnik_test"
```

```bash
cp env.example .env              # completar SESSION_SECRET y SEED_PASSWORD
npx prisma migrate dev           # aplica la migración inicial, con sus CHECK
npm run db:seed                  # 8 productos y 2 usuarios
npm run dev                      # http://localhost:3000
```

El fichero de ejemplo se llama `env.example`, sin punto inicial: el hook de pre-commit del repositorio rechaza cualquier `.env*` para que un secreto no pueda llegar a un commit por descuido. Para activarlo tras clonar: `git config core.hooksPath .githooks`.

Usuarios sembrados: `admin@carnik.test` (`ADMIN`) y `empleado@carnik.test` (`EMPLOYEE`), ambos con la contraseña de `SEED_PASSWORD`.

#### Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `SESSION_SECRET` | Firma de la cookie de sesión. Mínimo 32 caracteres |
| `ANTHROPIC_API_KEY` | Proveedor de AI. Sólo con `ORDER_DRAFTER=llm` |
| `ANTHROPIC_MODEL` | Modelo del intérprete. Por defecto `claude-opus-5-5` |
| `ANTHROPIC_WORKSPACE_ID` | Sólo si la API key no está asignada a un workspace |
| `ORDER_DRAFTER` | `llm` o `rules` (determinista, sin red) |
| `WHATSAPP_TRANSPORT` | `twilio`: envía por WhatsApp, sólo a conversaciones que llegaron por WhatsApp. `log` (por defecto, tests y CI): registra sin enviar |
| `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` | Cuenta de Twilio. El token firma el webhook y autentica los envíos. **Secreto** |
| `TWILIO_WHATSAPP_FROM` | Número del sandbox, `whatsapp:+14155238886` |
| `TWILIO_WEBHOOK_URL` | URL exacta configurada en Twilio; la firma se valida contra ella. Sin las cuatro `TWILIO_*`, el webhook rechaza todo |
| `SIMULATOR_ENABLED` | `true` habilita `/simulator` y su endpoint. Con `false` responden 404 |
| `SEED_PASSWORD` | Contraseña de los usuarios sembrados. Sólo la usa el seed |

#### Tests

```bash
npm test                         # unitarios + integración contra carnik_test
npm run build && npm run test:e2e  # E2E con Playwright contra next start
```

Los tests leen `tests/test.env`, que no contiene secretos, y **nunca el `.env` de desarrollo**. La configuración se niega a correr contra una base cuyo nombre no contenga `test`.

---

## 2. Arquitectura del sistema

### 2.1 Diagrama de arquitectura

```mermaid
flowchart TB
    subgraph cliente["Cliente"]
        WA["Teléfono del cliente<br/>app de WhatsApp"]
        BO["Navegador del empleado<br/>backoffice y catálogo"]
        KIOSK["Pantalla del local<br/>cola de armado"]
    end

    subgraph app["Aplicación · Next.js 15 · una instancia en Railway"]
        RH["Route handlers<br/>webhook · simulador · pedidos"]
        UI["Server Components<br/>páginas y server actions"]
        CORE["Núcleo de dominio<br/>src/core · agnóstico de proveedor"]
    end

    subgraph datos["Datos"]
        DB[("PostgreSQL 16<br/>gestionado por Railway")]
    end

    subgraph ext["Servicios externos"]
        TW{{"Twilio<br/>WhatsApp Sandbox"}}
        AI{{"Anthropic<br/>Claude API"}}
    end

    WA -->|"WhatsApp"| TW
    TW -->|"HTTPS · webhook firmado X-Twilio-Signature"| RH
    BO -->|"HTTPS · cookie de sesión"| UI
    KIOSK -->|"HTTPS · cookie de sesión"| UI
    RH -->|"llamada en proceso"| CORE
    UI -->|"llamada en proceso"| CORE
    CORE -->|"SQL sobre TCP/TLS"| DB
    CORE -->|"HTTPS REST · Account SID y Auth Token"| TW
    CORE -->|"HTTPS REST · API key"| AI
    TW -->|"WhatsApp"| WA

    classDef externo fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef almacen fill:#dcfce7,stroke:#15803d,color:#14532d
    class TW,AI externo
    class DB almacen
```

Rectángulos para servicios, cilindro para la base de datos, hexágonos para servicios externos. **Las dos flechas etiquetadas «llamada en proceso» son la decisión arquitectónica entera**: ahí no hay red, ni serialización, ni un fallo parcial posible. Todo lo demás son fronteras reales con su protocolo.

#### Qué patrón sigue

**Monolito modular desplegado como una sola unidad**, con **puertos y adaptadores en exactamente dos fronteras** — la entrada de mensajes y el intérprete de pedidos — y en ninguna más. No es hexagonal por convicción: es hexagonal donde hay dos implementaciones reales que intercambiar (Twilio frente a simulador, LLM frente a determinista) y monolito plano donde no las hay.

#### Por qué para *este* proyecto

Una persona, ~22 h de implementación, Railway. Tres consecuencias concretas:

- **Un despliegue, un pipeline, una base de datos.** No hay contratos entre servicios que versionar, ni un segundo `Dockerfile`, ni coordinación de despliegues. Cada servicio extra habría duplicado el trabajo de CI y de observabilidad, que es trabajo que no produce ninguna cláusula del flujo E2E.
- **El sistema entero corre en local con un comando** y sin túnel, gracias a los dos adaptadores alternativos. Eso es lo que hace que el test E2E sea posible dentro del presupuesto.
- **La transacción de confirmación es una transacción de base de datos**, no una saga. Si el descuento de existencias viviera en otro servicio, garantizar «o se confirma y se descuenta, o no pasa nada» exigiría compensaciones, idempotencia distribuida y un modo de fallo nuevo — para el requisito que más importa del producto.

**Sobre colas, microservicios y caché distribuida:** no los propongo, y mi respuesta no cambia con 50 h en vez de 22. El volumen es de decenas de mensajes al día; no hay un problema de throughput que resolver, y una cola sólo aportaría reintentos automáticos del envío saliente — que hoy se resuelve marcando el `Message` como `FAILED` y dejándolo visible en el detalle. Con 50 h invertiría el margen en cobertura de tests y en el catálogo conversacional, no en infraestructura que crea modos de fallo antes de resolver ninguno.

#### Qué aporta

| Beneficio | Concreto |
|---|---|
| Atomicidad real | `confirmOrder` es una transacción de PostgreSQL, no una coreografía |
| Depuración completa en local | Un proceso, un log, un depurador |
| Coste de despliegue casi nulo | `git push` a `main`, migraciones en el arranque |
| Cambio de proveedor barato | Probado en la práctica: el paso de Meta, diseñado en la Entrega 1, a Twilio sólo tocó `src/lib/twilio/` y una ruta nueva; el núcleo no cambió |
| Superficie de ataque mínima | Un solo servicio expuesto, dos endpoints públicos, sin red interna que proteger |

#### Qué sacrifica

Elegir esto cuesta cosas, y son estas:

1. **Escalado acoplado.** No se puede escalar la ingesta sin escalar también el backoffice y la pantalla del local. Una campaña que multiplique los mensajes obliga a sobredimensionar todo el proceso.
2. **Sin aislamiento de fallos.** No hay mamparos: un bucle infinito o una fuga de memoria en cualquier parte tumba el webhook, el backoffice y el dashboard a la vez. En una arquitectura con servicios separados, el mostrador seguiría funcionando aunque la ingesta cayera.
3. **La latencia del LLM está en el camino crítico del webhook.** La llamada a Anthropic ocurre dentro de la petición que Twilio espera (hasta 15 s). Se mitiga con un timeout de 8 s y el respaldo determinista, pero **es una mitigación, no una solución**: la solución sería responder 200 al instante y redactar en background, y eso exige trabajo asíncrono que este diseño no tiene.
4. **El envío saliente no se reintenta.** Sin cola no hay reintento automático: un fallo de red queda registrado como `FAILED` y visible para el empleado, que decide si reenvía a mano. El cliente puede quedarse sin su resumen aunque el pedido esté confirmado.
5. **Sin caché.** Cada carga del listado y cada sondeo del indicador van a la base. A este volumen es irrelevante, pero significa que el suelo de latencia lo pone PostgreSQL.
6. **Despliegue todo o nada.** No se puede publicar un arreglo del dashboard sin volver a desplegar el webhook. Cada despliegue arriesga la ingesta.
7. **Acoplamiento a Railway y a Prisma.** Migrar a otro proveedor implica rehacer el pipeline y la gestión de migraciones. Es deuda aceptada a cambio de no gastar horas en abstraerse de una plataforma que quizá nunca se cambie.

Los sacrificios 3 y 4 son los únicos que tocan al usuario final. Los demás son problemas de un producto con tráfico, y este todavía no lo tiene.

### 2.2 Descripción de componentes principales

| Componente | Responsabilidad | Tecnología | Por qué existe por separado |
|---|---|---|---|
| **Route handlers** (`src/app/api/`) | Traducir HTTP a dominio: verificar firma, parsear, validar y delegar | Next.js Route Handlers | Son los únicos que conocen HTTP y el formato de Twilio. Fusionarlos con el núcleo obligaría a construir peticiones falsas para probar reglas de negocio |
| **Server Components y server actions** (`src/app/`) | Renderizar el backoffice y recibir las acciones del empleado | React Server Components | Separados del núcleo por la misma razón: probar el cálculo de un total no debería requerir renderizar un árbol de React |
| **Núcleo de dominio** (`src/core/`) | Ingesta, redacción, valoración, confirmación, existencias | TypeScript puro más Prisma Client | **No importa nada de Next.js ni del proveedor de WhatsApp.** Es lo que permite que la mayoría de los tests corran sin levantar la aplicación |
| **`OrderDrafter`** (`src/core/drafting/`) | Convertir texto libre en líneas de pedido | Interfaz con dos implementaciones: `@anthropic-ai/sdk` y un parser por reglas | Separado como puerto porque hay **dos implementaciones reales**: la de reglas hace la suite determinista y sostiene el sistema si el proveedor falla |
| **Adaptador de Twilio** (`src/lib/twilio/`) | Validar la firma, traducir el formulario a `InboundMessage` y enviar | SDK oficial `twilio`, con modo `log` | Único módulo que conoce al proveedor. El modo de sólo registro permite que tests y E2E verifiquen el envío sin red, y las conversaciones del simulador nunca salen a Twilio |
| **Guardia de autorización** (`src/lib/auth/guard.ts`) | Comprobar sesión y rol dentro de cada operación | Cookie firmada | Aparte y explícito para que la comprobación sea **una línea visible al principio de cada handler**. Escondida en middleware, se convierte en la clase de bypass que documenta `design.md` |
| **Respuestas automáticas** (`src/core/messaging/replies.ts`) | Acuse, saludo con «lo de siempre», respuesta a consultas de precio y aviso de límite | Plantillas en TypeScript | La AI clasifica la intención pero **nunca redacta** texto para el cliente: todo sale de aquí con datos de la base |
| **Esquemas de validación** (`src/lib/validation/`) | Validar en servidor toda entrada de usuario | Zod | Centralizados para que la respuesta a «¿dónde se valida esto?» sea un fichero y no una búsqueda |
| **Cliente Prisma** (`src/lib/db.ts`) | Instancia única de conexión | Prisma Client | Un solo punto evita agotar el pool con recargas en caliente durante el desarrollo |

### 2.3 Estructura de ficheros

Árbol real del repositorio.

```
SRS-Carnik/
├── .claude/                           # skills y comandos de OpenSpec, subagente spec-reviewer, hook guard-env
├── .githooks/pre-commit               # rechaza cualquier .env* (activar con core.hooksPath)
├── .github/workflows/
│   ├── ci.yml                         # auditoría, lint, typecheck, unit + integración, build, E2E
│   └── ai-review.yml                  # revisión del PR con Claude según REVIEW.md, no bloquea
├── openspec/
│   ├── specs/                         # specs vivas: 5 capacidades
│   └── changes/archive/               # bootstrap-carnik y un change por incremento (10 en total)
├── prisma/
│   ├── schema.prisma                  # las 8 entidades de §3
│   ├── migrations/                    # init (con los dos CHECK a mano) y add_stock_movement
│   └── seed.ts                        # idempotente: 8 productos, 2 usuarios
├── src/
│   ├── app/                           # ADAPTADORES DE ENTRADA — conocen HTTP
│   │   ├── layout.tsx · page.tsx      # / redirige según sesión
│   │   ├── login/{page.tsx,actions.ts}
│   │   ├── (staff)/                   # grupo de rutas con requireRole en el layout
│   │   │   ├── layout.tsx                       # navegación con el badge de pendientes
│   │   │   ├── admin/orders/page.tsx            # listado
│   │   │   ├── admin/orders/[id]/{page,actions}.tsx  # detalle, edición de líneas, mensaje manual
│   │   │   ├── admin/products/…                 # catálogo y ficha de producto (server actions)
│   │   │   ├── dashboard/page.tsx               # pantalla del local
│   │   │   └── simulator/page.tsx
│   │   └── api/
│   │       ├── webhooks/twilio/route.ts         # WhatsApp entrante, con firma
│   │       ├── simulator/messages/route.ts
│   │       ├── orders/[orderId]/confirm/route.ts
│   │       ├── orders/pending-count/route.ts
│   │       ├── orders/assembly-queue/route.ts
│   │       └── health/route.ts
│   ├── core/                          # LÓGICA DE NEGOCIO — no importa Next.js ni Twilio
│   │   ├── messaging/{types,ingest,outbound,replies,rateLimit,manual,catalogAnswer}.ts
│   │   ├── drafting/{types,schema,intent,aliases,rules,llm,index}.ts
│   │   ├── orders/{pricing,createDraft,editLines,repeat,confirm,queries,assemblyQueue}.ts
│   │   └── catalog/{products,stock,committed,lock,queries}.ts
│   ├── lib/                           # infraestructura
│   │   ├── db.ts · http.ts
│   │   ├── auth/{session,guard}.ts
│   │   ├── twilio/{config,parse,send}.ts         # único módulo que conoce a Twilio
│   │   └── validation/{messaging,orders,catalog}.ts
│   └── components/                    # formularios cliente; la lógica de estado del badge y de
│                                      # la cola en módulos puros testeables sin DOM
├── tests/
│   ├── unit/                          # 8 ficheros, sin base de datos
│   ├── integration/                   # 13 ficheros, contra PostgreSQL
│   ├── e2e/{order-flow,catalog}.spec.ts
│   ├── env.ts · test.env              # variables de test, sin secretos
│   └── global-setup.ts                # migraciones sobre la base de test
├── docs/                              # README.md con el índice de la carpeta
│   ├── adr/                           # 5 decisiones de arquitectura
│   ├── api/openapi.yaml               # contrato de §4
│   └── screenshots/                   # capturas de §1.3, generadas con scripts/capture-screenshots.mjs
├── scripts/capture-screenshots.mjs    # regenera las capturas de §1.3 con Playwright
├── env.example                        # variables, sin valores
├── railway.json · next.config.ts · vitest.config.ts · playwright.config.ts
├── CLAUDE.md · AGENTS.md · REVIEW.md  # instrucciones del agente y criterio de revisión
└── readme.md · prompts.md · SECURITY.md · LICENSE
```

Respecto del diseño de la Entrega 1 cambió el adaptador de WhatsApp (`lib/whatsapp/*` de Meta → `lib/twilio/*`) y no existe `core/stock/adjust.ts`: la corrección de existencias vive en `core/catalog/`. La seguridad está documentada en §2.5; `SECURITY.md` recoge lo operativo (cómo reportar, riesgos pendientes y registro de incidentes).

#### Propósito de cada carpeta y a qué patrón obedece

| Carpeta | Propósito | Patrón |
|---|---|---|
| `src/app/` | Todo lo que habla HTTP o renderiza: rutas, páginas, server actions | **Adaptadores de entrada** de puertos y adaptadores. Es la única capa que conoce Next.js |
| `src/core/` | Las reglas del negocio: qué es un pedido válido, cómo se valora, cuándo se puede confirmar | **Dominio.** No importa nada de `next/*` ni del formato de Twilio |
| `src/lib/` | Lo que habla con el mundo exterior o con el framework: base de datos, sesión, transporte, validación | **Adaptadores de salida** e infraestructura |
| `prisma/` | Esquema, migraciones y semillas | Fuente de verdad del modelo de §3 |
| `tests/` | Tres niveles separados por lo que necesitan levantar | Pirámide: muchos unitarios, algunos de integración, **un solo E2E** |
| `openspec/` | La especificación, versionada junto al código | Ver abajo |

#### Qué hace `openspec/` en el flujo de trabajo

No es documentación de acompañamiento: es **la fuente de la que salen las secciones 1, 3, 4 y 5 de este readme**. El ciclo es `propose → apply → archive`. Un cambio empieza como una carpeta en `changes/` con cuatro artefactos —propuesta, specs delta por capacidad, diseño y tareas— que se validan con `openspec validate --strict` antes de escribir una línea de código. Al terminar, `archive` funde los deltas en `specs/`, que queda como la especificación vigente del sistema.

Lo que compra en la práctica: **los escenarios Gherkin de los specs son los tests de integración**, así que la especificación no se desincroniza del código sin que la suite se ponga roja. Los tres huecos encontrados en las revisiones —el mensaje manual sobre un pedido confirmado, la respuesta tardía del proveedor de AI, el mensaje sin intención de pedido— aparecieron porque los artefactos se revisaron entre sí, no porque alguien los descubriera programando.

#### Dónde vive la lógica de negocio, y por qué no en los route handlers

**Toda en `src/core/`.** Un route handler hace exactamente cuatro cosas y ninguna más: comprobar autorización, validar la entrada con Zod, llamar a una función del núcleo, y traducir el resultado a una respuesta HTTP. Si un handler contiene un `if` sobre reglas del negocio, está en el sitio equivocado.

La razón es **testabilidad sin levantar la aplicación**. `confirmOrder` es una función que recibe un identificador y un usuario, y devuelve un resultado o lanza: se prueba contra una base de datos efímera, sin servidor HTTP, sin cookies y sin renderizar React. Si esa lógica viviera dentro del handler, probar «doble confirmación no descuenta dos veces» exigiría arrancar Next.js, fabricar una sesión firmada y emitir dos peticiones concurrentes — un test cinco veces más lento, más frágil, y que falla por motivos que no tienen que ver con la regla que quería verificar.

Es también lo que hace posible la pirámide de `tests/`: la mayoría del comportamiento se cubre en unitarios e integración, y el único E2E existe para verificar que las piezas están bien conectadas, no para verificar reglas.

### 2.4 Infraestructura y despliegue

#### Estado verificado

| Pieza | Estado real |
|---|---|
| **URL pública** | https://srs-carnik-production.up.railway.app · healthcheck en `/api/health` |
| **Railway** | Proyecto con dos servicios, la app Next.js (builder Railpack) y PostgreSQL 16 gestionado sin exposición pública. Configuración versionada en `railway.json` |
| **Arranque** | `npm start` = `prisma migrate deploy && next start`. Las migraciones corren antes de servir tráfico, como describe el diagrama |
| **CI** | `.github/workflows/ci.yml` en verde en cada push del PR: auditoría de dependencias de producción → lint → typecheck → unitarios e integración contra un servicio PostgreSQL → build → E2E con Playwright |
| **WhatsApp** | Webhook `POST /api/webhooks/twilio` dado de alta en el sandbox de Twilio; mensajes reales recibidos y respondidos (acuse y resumen) desde un teléfono |
| **Cabeceras de seguridad** | `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy` verificadas en la respuesta pública |

Tres diferencias con el diseño de abajo:

- **Twilio en lugar de Meta.** El diseño de la Entrega 1 (D7) eligió Meta Cloud API porque firma sobre el cuerpo crudo, mientras Twilio firma sobre la URL pública, que detrás del proxy de Railway no coincide con la que ve el proceso. La decisión se revirtió por tres hechos nuevos: ya había cuenta de Twilio y no app de Meta, cuyo alta era el paso más incierto; el sandbox de Twilio permite a un evaluador probar desde su teléfono, mientras que el número de prueba de Meta exige verificar cada destinatario; y el tiempo era de horas. La trampa de la URL se neutraliza **sin reconstruir nada**: la firma se valida contra la variable fija `TWILIO_WEBHOOK_URL` (decisión T2 de `add-whatsapp-twilio-channel`), y un test lo comprueba con cabeceras `X-Forwarded-*` manipuladas.
- **Migraciones en CI.** No son un paso propio del workflow: las aplica el `globalSetup` de los tests antes de la primera suite, que es el mismo `prisma migrate deploy` sobre una base vacía.
- **Protección de `main`.** El paso 4 del proceso de despliegue («la rama `main` está protegida») es una recomendación, **no está configurado** en el repositorio. El control efectivo es que todo entra por PR con el CI en verde.

#### Pipeline de integración y despliegue

```mermaid
flowchart LR
    DEV["Desarrollador<br/>rama de trabajo"] -->|"git push"| GH["GitHub<br/>pull request a main"]
    GH -->|"dispara"| CI["GitHub Actions"]

    subgraph ci["CI · sin secretos reales · transporte en modo log"]
        direction TB
        L["lint + typecheck"] --> U["tests unitarios"]
        U --> M1["prisma migrate deploy<br/>MIGRACIONES 1 de 2<br/>base efímera del runner"]
        M1 --> I["tests de integración"]
        I --> B["next build"]
        B --> E["test E2E<br/>contra el simulador"]
    end

    CI --> L
    E -->|"pipeline en verde"| MERGE["merge a main"]
    MERGE -->|"integración GitHub-Railway"| RW["Railway<br/>build de la imagen"]
    RW --> M2["prisma migrate deploy<br/>MIGRACIONES 2 de 2<br/>al arrancar el contenedor"]
    M2 -->|"salida 0"| APP["Servicio web activo"]
    M2 -.->|"salida distinta de 0"| FAIL["Despliegue marcado como fallido<br/>sigue sirviendo la versión anterior"]
    APP -->|"HTTPS"| URL["URL pública<br/>destino del webhook de Twilio"]

    classDef migr fill:#fde8d7,stroke:#c2410c,color:#7c2d12
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d
    class M1,M2 migr
    class FAIL bad
```

**Las migraciones se ejecutan en dos puntos distintos, y conviene no confundirlos.** En naranja:

1. **En CI**, contra una base efímera del runner, antes de los tests de integración. Si una migración está rota, el pipeline se pone rojo **antes** de tocar producción.
2. **En Railway**, como parte del comando de arranque del contenedor, antes de que el proceso empiece a servir tráfico. Es el único punto donde se toca el esquema de producción.

#### Entorno de Railway

```mermaid
flowchart TB
    subgraph railway["Proyecto Railway · entorno production"]
        subgraph websvc["Servicio web · Next.js 15"]
            START["Comando de arranque<br/>prisma migrate deploy && next start"]
            APP["Proceso Node<br/>route handlers y páginas"]
            VARS["Variables de entorno<br/>13 claves · sólo aquí"]
        end
        DB[("PostgreSQL 16<br/>servicio gestionado")]
    end

    subgraph fuera["Fuera de Railway"]
        GH["GitHub · rama main"]
        TW{{"Twilio<br/>WhatsApp Sandbox"}}
        AI{{"Anthropic<br/>Claude API"}}
        USR["Navegador y<br/>pantalla del local"]
    end

    GH -->|"integración de despliegue"| START
    START -->|"SQL DDL · migraciones"| DB
    START -->|"si sale 0, cede el proceso"| APP
    VARS -.->|"inyectadas en el proceso"| APP
    VARS -.->|"DATABASE_URL"| START
    DB -->|"SQL sobre TCP/TLS"| APP
    APP -->|"HTTPS REST saliente"| TW
    APP -->|"HTTPS REST saliente"| AI
    TW -->|"HTTPS · webhook entrante firmado"| APP
    USR -->|"HTTPS"| APP

    classDef externo fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef almacen fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef secreto fill:#ede9fe,stroke:#6d28d9,color:#4c1d95
    class TW,AI externo
    class DB almacen
    class VARS secreto
```

Dos servicios en un mismo proyecto de Railway. `DATABASE_URL` la inyecta Railway al enlazar el servicio de PostgreSQL con el web; las demás se cargan a mano una vez. **La base de datos no está expuesta a internet**: sólo la alcanza el servicio web por la red interna del proyecto.

#### Entornos

| Entorno | Dónde | Base de datos | Canal de WhatsApp | Para qué |
|---|---|---|---|---|
| **Local** | Máquina de desarrollo | PostgreSQL local o en Docker | Ninguno — `WHATSAPP_TRANSPORT=log` y simulador | Desarrollo y depuración |
| **CI** | Runner efímero de GitHub Actions | PostgreSQL como servicio del job | Ninguno | Verificación automática en cada push |
| **Producción** | Railway | PostgreSQL gestionado | Sandbox de WhatsApp de Twilio (+1 415 523 8886) y simulador | Demo y URL pública |

**No hay staging, y la razón no es sólo el presupuesto.** El sandbox de Twilio **admite una única URL de webhook por cuenta**: un staging exigiría una segunda cuenta con su propio sandbox y sus propios participantes. Eso duplica la parte más frágil del proyecto para proteger un sistema sin usuarios reales.

Lo que hace de staging: el **entorno local con el simulador**, que ejercita el flujo completo sin red externa, más el **pipeline de CI**, que corre el E2E contra ese mismo simulador en cada push. La red de seguridad de producción no es un entorno intermedio, es la capacidad de revertir el despliegue en Railway.

#### Proceso de despliegue, paso a paso

1. Trabajo en una rama, nunca directamente sobre `main`.
2. `git push` y apertura del pull request. GitHub Actions arranca solo.
3. CI ejecuta, en orden: `lint` → `typecheck` → tests unitarios → `prisma migrate deploy` sobre la base efímera → tests de integración → `next build` → test E2E contra el simulador.
4. Sin pipeline verde no hay merge. La rama `main` está protegida.
5. Merge a `main`. La integración de Railway con GitHub detecta el commit y construye la imagen.
6. Railway arranca el contenedor con `prisma migrate deploy && next start`. **Las migraciones corren aquí, antes de servir la primera petición.**
7. Si el comando de arranque devuelve 0, el nuevo despliegue pasa a activo y Railway retira el anterior. Si devuelve distinto de 0, el despliegue se marca como fallido y **la versión anterior sigue sirviendo**.
8. Verificación manual: cargar la URL pública, iniciar sesión en el backoffice y enviar un mensaje por el simulador para comprobar el flujo de punta a punta.

#### Si una migración falla al desplegar

**Lo que pasa automáticamente.** El comando de arranque sale con código distinto de 0, el contenedor no llega a servir, Railway marca el despliegue como fallido y **el despliegue anterior sigue atendiendo tráfico**. No hay ventana de servicio caído. PostgreSQL ejecuta el DDL dentro de una transacción, así que **la migración que falla revierte sus propios cambios**; las migraciones anteriores del mismo lote que sí terminaron quedan aplicadas.

**Cómo se revierte.** El código se revierte desde el panel de Railway, redesplegando la versión anterior. El esquema es el problema real:

> **Las migraciones de este proyecto no son reversibles.** No se generan migraciones `down`. La recuperación es **hacia adelante**: se corrige el fichero de migración, se verifica en local y en CI, y se despliega de nuevo.

Mientras no haya datos reales, la salida de emergencia es `prisma migrate reset` seguido de `prisma db seed`, que reconstruye el esquema desde cero. **Es aceptable hoy y deja de serlo el día que exista un solo pedido de un cliente de verdad** — momento en el que hará falta política de copias y migraciones reversibles. Está declarado como limitación consciente en `design.md`, no como descuido.

**Regla que evita casi todos estos casos:** una migración que rompe el esquema en producción tendría que haber roto antes el paso 3 del pipeline, que ejecuta exactamente el mismo comando contra una base limpia. El fallo en Railway sólo debería ocurrir por divergencia entre el estado de la base de producción y el de la base efímera de CI.

### Gestión de secretos

#### Dónde vive cada variable

| Variable | Propósito | Ejemplo **falso** | Local `.env` | GitHub Secrets | Railway |
|---|---|---|:-:|:-:|:-:|
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://carnik:changeme@localhost:5432/carnik` | ✅ | ⬜ *(el job la fija al servicio del runner)* | ✅ *(la inyecta Railway)* |
| `SESSION_SECRET` | Firma de la cookie de sesión | `dev-only-not-a-real-secret-0000000000` | ✅ | ⬜ *(valor de prueba fijo en el workflow)* | ✅ |
| `TWILIO_ACCOUNT_SID` | Cuenta de Twilio | `AC00000000000000000000000000000000` | ⬜ *(no hace falta con `log`)* | ⬜ | ✅ |
| `TWILIO_AUTH_TOKEN` | Firma del webhook y autenticación de envíos. **Secreto** | `00000000000000000000000000000000` | ⬜ | ⬜ *(los tests usan uno ficticio)* | ✅ |
| `TWILIO_WHATSAPP_FROM` | Número emisor del sandbox | `whatsapp:+14155238886` | ⬜ | ⬜ | ✅ |
| `TWILIO_WEBHOOK_URL` | URL exacta contra la que se valida la firma | `https://…/api/webhooks/twilio` | ⬜ | ⬜ | ✅ |
| `WHATSAPP_TRANSPORT` | `twilio` o `log` | `log` | ✅ | ✅ *(`log`)* | ✅ *(`twilio`)* |
| `ANTHROPIC_API_KEY` | Proveedor de AI | `sk-ant-api03-FAKE-KEY-DO-NOT-USE` | ⬜ *(no hace falta con `rules`)* | ⬜ | ✅ |
| `ANTHROPIC_MODEL` | Modelo del intérprete | `claude-opus-5-5` | ⬜ | ⬜ | ✅ |
| `ORDER_DRAFTER` | `llm` o `rules` | `rules` | ✅ | ✅ *(`rules`)* | ✅ *(`llm`)* |
| `SIMULATOR_ENABLED` | Habilita el canal de simulación | `true` | ✅ | ✅ *(`true`)* | ✅ *(`true` para la demo)* |
| `SEED_PASSWORD` | Contraseña de los usuarios sembrados | `cambiame-en-local` | ✅ | ✅ *(valor de prueba)* | ✅ |

**GitHub Secrets no guarda ni un solo secreto real, y es intencionado.** El pipeline corre con `WHATSAPP_TRANSPORT=log` y `ORDER_DRAFTER=rules`, de modo que **no hace ninguna llamada externa**: los valores que necesita son constantes de prueba que pueden ir en claro en el workflow. Tampoco hace falta un token de despliegue, porque Railway despliega por su propia integración con GitHub y no desde Actions. Consecuencia: **una filtración del repositorio no compromete ninguna credencial de producción.**

Las variables marcadas ⬜ en local sólo hacen falta para probar contra Twilio o contra el proveedor de AI de verdad. El desarrollo normal no las necesita.

#### `env.example` y `.gitignore`

**Implementado.** El fichero de ejemplo se versiona como `env.example`, con las claves de esta entrega y sin un solo secreto. Va sin punto inicial porque el hook de pre-commit del repositorio rechaza cualquier ruta que coincida con `.env` o `.env.*`, también la de ejemplo: preferí renombrar el fichero a debilitar el control. Las variables de test, también sin secretos, viven en `tests/test.env`.

`.gitignore` ignora `.env` y `.env.*`, y se comprobó antes del primer commit de código:

```bash
git check-ignore -v .env   # .gitignore:2:.env	.env
```

**Variables en Railway** (los valores no salen de Railway): `DATABASE_URL` como referencia a la del servicio PostgreSQL (`${{Postgres.DATABASE_URL}}`), `SESSION_SECRET` generado con `openssl rand -hex 32`, `SEED_PASSWORD` aleatoria, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ORDER_DRAFTER=llm`, `WHATSAPP_TRANSPORT=twilio`, `SIMULATOR_ENABLED=true` y las cuatro `TWILIO_*`. El `TWILIO_AUTH_TOKEN` se cargó directamente en el panel de Railway, sin pasar por el repositorio ni por la conversación con el asistente.

**GitHub Secrets sigue vacío, como se diseñó.** El workflow fija en claro valores de prueba que no protegen nada (`ORDER_DRAFTER=rules`, una base efímera, un `SESSION_SECRET` de CI), así que una filtración del repositorio no compromete ninguna credencial.

#### Si un secreto se filtra

**Principio de partida: un secreto expuesto se considera comprometido aunque no haya indicios de uso.** Y si llegó a un commit, borrarlo del historial **no deshace la exposición**: el repositorio pudo clonarse o indexarse antes. Reescribir la historia es higiene posterior, nunca el remedio.

Orden de operaciones: **crear el nuevo → actualizar Railway → revocar el viejo**, que evita el corte de servicio. Con evidencia de uso malicioso se invierte: **revocar primero** y asumir la caída.

| Secreto | Dónde se rota | Efecto colateral |
|---|---|---|
| `SESSION_SECRET` | Variables de Railway | Cierra todas las sesiones abiertas. Con dos cuentas, irrelevante |
| `TWILIO_AUTH_TOKEN` | Consola de Twilio (token secundario → promover → revocar el primario) | El webhook rechaza todo y los envíos fallan hasta actualizar Railway. **Rotarlo en horario de poco tráfico** |
| `ANTHROPIC_API_KEY` | Consola de Anthropic | El sistema cae al intérprete determinista. **El flujo no se interrumpe** |
| `DATABASE_URL` | Rotación de credenciales del servicio PostgreSQL de Railway | Reinicio del servicio web |

Después de cualquier rotación: revisar los registros de acceso del proveedor afectado en busca de uso no reconocido, y anotar el incidente en `SECURITY.md`. **La única rotación que interrumpe el flujo E2E es la de `TWILIO_AUTH_TOKEN`**; la del proveedor de AI, que a primera vista parecería la más grave, es precisamente la más benigna gracias al respaldo determinista.

### 2.5 Seguridad

Cada punto indica el archivo, el endpoint o la tabla concretos donde se aplica. Lo que no vaya a estar en el MVP va marcado como **PREVISTA** en la tabla de riesgos del final, no disimulado.

#### Flujo de autenticación y autorización

```mermaid
sequenceDiagram
    autonumber
    participant N as Navegador
    participant H as Route handler
    participant G as requireRole
    participant V as Zod
    participant D as PostgreSQL via Prisma

    N->>H: POST /api/orders/{orderId}/confirm<br/>cookie carnik_session
    Note over N,H: No hay middleware.ts: nada intercepta<br/>la peticion antes del handler
    H->>G: requireRole EMPLOYEE o ADMIN

    alt Cookie ausente, firma invalida o sesion expirada
        G-->>N: 401 UNAUTHENTICATED
        Note over G,D: Sin tocar la base: no revela si el Order existe
    else Sesion valida pero rol no autorizado
        G-->>N: 403 FORBIDDEN
        Note over G: Hoy inalcanzable: ADMIN y EMPLOYEE<br/>son los unicos roles y ambos pasan
    else Sesion y rol validos
        G->>V: valida orderId y cuerpo
        alt Entrada invalida
            V-->>N: 400 VALIDATION_ERROR
        else Entrada valida
            V->>H: datos tipados
            H->>D: UPDATE Order SET status=CONFIRMED<br/>WHERE id=? AND status=DRAFT
            alt El pedido ya no esta en borrador
                D-->>H: 0 filas afectadas
                H-->>N: 200 OrderConfirmed con alreadyConfirmed=true
                Note over H,D: Autorizacion por ESTADO, no por pertenencia:<br/>sin segundo descuento ni segundo resumen.<br/>Editar lineas en ese estado si se rechaza (ORDER_NOT_DRAFT)
            else Accion permitida
                D-->>H: 1 fila, la transaccion continua
                H-->>N: 200 OrderConfirmed
            end
        end
    end
```

**Lo que el diagrama enseña y conviene no perderse: no hay `middleware.ts`.** La primera comprobación de la petición ocurre **dentro del handler**, y la redirección por comodidad a `/login` la hace el propio layout de `/admin`. Se descartó tener un middleware precisamente porque sería un fichero que alguien podría confundir con el control de seguridad — y la clase de bypass de Next.js (CVE-2025-29927) es exactamente el fallo de confiar la autorización a esa capa. **No existe la capa, no existe la tentación.**

#### 1 · Autenticación

**Mecanismo:** sesión en **cookie firmada** (`httpOnly`, `secure`, `sameSite=lax`), implementada en `src/lib/auth/session.ts` sobre una librería establecida —`iron-session` o equivalente— en lugar de firmar a mano.

**Por qué encaja con el alcance:** no hay autorregistro, ni OAuth, ni recuperación de contraseña, ni más de dos cuentas. Auth.js v5 se descartó en `design.md` (D4) porque su configuración en App Router es un sumidero conocido y no aportaría ninguna funcionalidad demostrable aquí. La contrapartida está declarada abajo.

**Credenciales:** `User.passwordHash` guarda **exclusivamente un hash argon2id** con sal por usuario. Nunca la contraseña en claro ni cifrado reversible: no existe ningún caso de uso que requiera recuperar el original. El hash se genera en `prisma/seed.ts` y se verifica en `src/app/login/actions.ts`.

**Duración y renovación:** **8 horas**, aproximadamente un turno de mostrador, con renovación deslizante al usar la aplicación. Suficiente para no reautenticarse a media mañana y corto para acotar el daño de una sesión robada.

**Cierre de sesión:** se borra la cookie y se emite una caducada. **Y aquí está la limitación honesta de haber elegido una sesión sin estado en servidor: no hay revocación.** Una cookie robada sigue siendo válida hasta que caduque, aunque el usuario cierre sesión en su navegador. Las dos mitigaciones son el TTL corto y **rotar `SESSION_SECRET` en Railway, que invalida todas las sesiones a la vez**. Con dos cuentas es un coste aceptable; con veinte, no lo sería.

#### 2 · Autorización

**Roles:** `ADMIN` y `EMPLOYEE`, en `User.role`. El cliente de WhatsApp **no es un rol**: no tiene cuenta y su número es un identificador, nunca una credencial.

**Matriz rol × acción sobre los recursos de §3:**

| Recurso | Acción | `ADMIN` | `EMPLOYEE` | Anónimo |
|---|---|:-:|:-:|:-:|
| `User` | Leer el propio | ✅ | ✅ | ❌ |
| `User` | Crear o modificar | ❌ sembrado | ❌ | ❌ |
| `Customer` | Leer | ✅ | ✅ | ❌ |
| `Customer` | Modificar datos identificativos | ✅ | ❌ | ❌ |
| `Conversation` | Leer | ✅ | ✅ | ❌ |
| `Message` | Leer | ✅ | ✅ | ❌ |
| `Message` | Crear `OUTBOUND` manual | ✅ | ✅ | ❌ |
| `Message` | Crear `INBOUND` | — | — | ✅ **sólo con firma HMAC válida** |
| `Message` | Editar o borrar | ❌ | ❌ | ❌ **inmutable para todos** |
| `Order` | Leer | ✅ | ✅ | ❌ |
| `Order` | Editar líneas en `DRAFT` | ✅ | ✅ | ❌ |
| `Order` | Confirmar | ✅ | ✅ | ❌ |
| `Order` | Editar en `CONFIRMED` | ❌ | ❌ | ❌ **prohibido por estado** |
| `OrderItem` | Crear, editar o borrar en `DRAFT` | ✅ | ✅ | ❌ |
| `Product` | Leer | ✅ | ✅ | ❌ |
| `Product` | Ingreso y reajuste de `stockQuantity` | ✅ | ✅ | ❌ |
| `Product` | Crear y cambiar `pricePerUnitCents` | ✅ | ❌ | ❌ |
| `Product` | Borrar | ❌ | ❌ | ❌ |
| `StockMovement` | Leer | ✅ | ✅ | ❌ |
| `StockMovement` | Editar o borrar | ❌ | ❌ | ❌ **inmutable para todos** |
| Canal de simulación | Usar | ✅ | ✅ | ❌ |

> Al construir esta matriz apareció una contradicción en `proposal.md`, que listaba el simulador como exclusivo de `ADMIN` mientras el spec `whatsapp-conversation` tiene un escenario con `EMPLOYEE`. **Corregido en `proposal.md`**; la fuente válida es el spec.

**Dónde se comprueba:** `requireRole(['EMPLOYEE','ADMIN'])` en `src/lib/auth/guard.ts`, invocado **como primera línea de cada route handler y de cada server action** que toque datos: `src/app/(staff)/layout.tsx`, `src/app/(staff)/admin/orders/[id]/actions.ts`, `src/app/(staff)/admin/products/actions.ts`, `src/app/(staff)/admin/products/[id]/actions.ts` y los cuatro route handlers con sesión de `src/app/api/` (confirmación, pendientes, cola de armado y simulador). **Nunca sólo en el frontend, y no hay middleware donde delegarlo:** los server actions de Next.js son endpoints HTTP públicos aunque el botón esté oculto.

**Cómo se garantiza que un usuario no accede a recursos de otro.** La respuesta honesta es que **aquí no existe «de otro»**: es una sola carnicería, no hay `tenantId` ni columna de propiedad, y cualquier `EMPLOYEE` está autorizado sobre cualquier `Order` porque ése es el comportamiento correcto en un negocio de dos a seis personas (§3). Lo que sí se aplica:

- **Autorización por estado, no por pertenencia.** La comprobación va **dentro de la misma escritura**: `UPDATE ... WHERE id = ? AND status = 'DRAFT'`. Cero filas afectadas significa «prohibido» sin una lectura previa que abriría una ventana de carrera.
- **Identificadores no adivinables.** Las claves primarias son `cuid` de 25 caracteres, no enteros secuenciales. `Order.reference` se deriva de los seis últimos caracteres del propio `cuid` (`K2M4P0`) precisamente para que **tampoco** sea enumerable: un correlativo diario tipo `2026-08-01-003` sería legible pero permitiría recorrer el catálogo de pedidos probando números. Aun así, **la API no acepta nunca la referencia como parámetro de ruta**: `POST /api/orders/{orderId}/confirm` valida contra `^c[a-z0-9]{20,32}$`.

#### 3 · Validación de entrada

Todo dato que entra pasa por un esquema Zod en `src/lib/validation/`, **también cuando ya se validó en el navegador**. Lo del cliente es comodidad; lo del servidor es el control.

| Punto de entrada | Qué se valida | Límite |
|---|---|---|
| `POST /api/webhooks/twilio` | `MessageSid`, remitente E.164, texto y adjuntos del formulario de Twilio. **Después de verificar la firma**, nunca antes | 4096 caracteres de texto |
| `POST /api/simulator/messages` | Número de cliente, nombre de perfil y texto, tras `SIMULATOR_ENABLED` y `requireRole` | 4096 caracteres de texto, 100 de nombre |
| `POST /api/orders/{orderId}/confirm` | `orderId` contra el patrón `cuid`. Sin cuerpo | — |
| `src/app/login/actions.ts` | Email y contraseña | 32 KiB |
| `src/app/admin/orders/[id]/actions.ts` | Cantidad > 0, `productId` existente y activo, longitud del mensaje manual | 32 KiB |
| `src/core/stock/adjust.ts` | Cantidad ≥ 0 y **entera si `Product.unit` es `PIECE`** | — |
| `src/core/drafting/llm.ts` | **La salida del modelo contra `DraftSchema`** antes de persistir nada | — |

Esa última fila es la menos obvia y la más importante: **la respuesta de un proveedor de AI es entrada no confiable exactamente igual que la de un usuario.** Si no valida, se descarta entera y entra el intérprete determinista.

**Subida de archivos: no existe ningún endpoint de subida.** Los adjuntos de WhatsApp —el único vector plausible— **se rechazan en la frontera sin descargar los bytes**: si el evento entrante no es de tipo texto, el sistema responde al cliente pidiendo texto y nunca lee `MediaUrl0` de Twilio. Por eso la regla de «no te fíes de la extensión ni del `Content-Type`» no llega a aplicarse: **ambos son metadatos que envía quien sube el fichero, y el único modo de saber qué es un fichero de verdad es inspeccionar sus bytes**. Al no descargarlos, la clase entera de vulnerabilidades desaparece en vez de mitigarse.

#### 4 · Protección de datos

**Qué se guarda y por qué es necesario:**

| Dato | Por qué no se puede prescindir |
|---|---|
| `Customer.phoneE164` | Es a la vez la identidad del cliente y la dirección de entrega de la respuesta. Sin él no hay canal |
| `Customer.profileName` | Única etiqueta legible para el mostrador y para la pantalla del local |
| `Message.body` | Es el pedido. Y el historial es lo que permite al empleado entender una aclaración |
| `Order`, `OrderItem` | El registro comercial de la venta |

**Qué se decidió no guardar:** email del cliente, dirección postal (no hay reparto), datos de pago (fuera de alcance), adjuntos (rechazados), ubicación, e identificadores del cliente enviados al proveedor de AI — al modelo sólo van el texto y el catálogo (`src/core/drafting/llm.ts`).

**Campos que nunca salen en una respuesta:** `User.passwordHash` en ningún caso y `Message.providerMessageId` nunca — **ninguno de los endpoints de §4 los devuelve, ni ningún otro campo personal**. `Customer.phoneE164` y `Message.body` sólo se muestran en el **detalle del backoffice**, que es una página renderizada en servidor bajo sesión válida y no una respuesta de API. En `/dashboard` están **prohibidos**, y se excluyen proyectando la consulta sin ellos, no filtrando después.

**Cifrado en tránsito:** HTTPS de extremo a extremo — navegador a Railway, Railway a PostgreSQL sobre TLS, y salientes a Twilio y Anthropic sobre HTTPS. **En reposo:** el volumen del PostgreSQL gestionado de Railway está cifrado por el proveedor. **No hay cifrado a nivel de campo**: quien obtenga un volcado de la base lee teléfonos y conversaciones en claro. Es un hueco real y está en la tabla de riesgos.

**Borrado y anonimizado: no implementados.** No hay ventana de retención, ni purga automática, ni endpoint de derecho de supresión. Bajo la nLPD suiza harían falta los tres. Queda declarado en `SECURITY.md` como deuda consciente, y marcado **PREVISTA** abajo.

#### 5 · Vulnerabilidades comunes

**Inyección SQL.** Prisma parametriza todas las consultas del *query builder*, que es lo único que usa el proyecto. **Dónde seguiría habiendo riesgo:** `$queryRaw` y `$executeRaw` con interpolación de cadenas. Regla del proyecto: **prohibidos**, y si alguna vez hicieran falta, sólo con `Prisma.sql` como plantilla etiquetada. Hoy no aparecen en ningún fichero, ni siquiera en el conteo del límite por cliente (`src/core/messaging/rateLimit.ts`), que usa el builder.

**XSS.** React escapa por defecto todo lo que se interpola en JSX. **Qué lo rompería:** `dangerouslySetInnerHTML`. Y aquí es donde tienta, porque hay **dos campos completamente controlados por el atacante** que se pintan en `/admin/orders/[id]`: `Message.body` y `OrderItem.rawText`, ambos texto libre escrito por quien manda el WhatsApp. Regla: **`dangerouslySetInnerHTML` está prohibido en el proyecto**, sin excepción de formato.

**CSRF.** La cookie es `sameSite=lax`, lo que bloquea los POST desde otro sitio, y los Server Actions de Next.js verifican origen por su cuenta. `sameSite=lax` sí permite la navegación GET de nivel superior, lo cual es seguro aquí porque **ninguna operación GET muta estado**. El webhook queda al margen del problema: no se autentica por cookie, así que un ataque CSRF contra él no tendría nada que robar — su control es la firma HMAC.

**Rate limiting.** Implementado **por cliente en la ingesta** (`src/core/messaging/rateLimit.ts`), contando `Message` de la conversación en una ventana antes de invocar al proveedor de AI. **En `/login`, por cuenta** (`src/lib/auth/loginThrottle.ts`): tras 5 fallos para un email se rechaza todo intento durante 15 minutos, y un email inexistente se verifica contra un hash señuelo para que el tiempo de respuesta no revele qué cuentas existen. El contador vive en memoria —Railway corre una instancia— y no se cuenta por IP, que el proxy puede falsear; a cambio, quien conozca un email puede bloquearlo temporalmente.

**Cabeceras de seguridad.** En `next.config.ts`: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `X-Frame-Options: DENY`. En producción, además, una **CSP base**: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `frame-ancestors 'none'`, con `'unsafe-inline'` en `script-src` porque Next.js hidrata con scripts inline. **Una CSP estricta con nonce por petición no entra en el MVP** — con App Router exige integrarse con el middleware. Marcada **parcial**. `poweredByHeader: false` quita la cabecera `x-powered-by`.

**Dependencias.** `npm audit --audit-level=high` como paso del workflow en `.github/workflows/ci.yml`, de modo que una vulnerabilidad alta o crítica pone el pipeline rojo. Sin Dependabot ni escáner externo: el proyecto tiene semanas de vida, no años.

#### 6 · Gestión de secretos

Ver **§2.4 · Gestión de secretos**, que contiene la tabla completa de las diez variables, dónde vive cada una, el contenido de `env.example` y la política de rotación ante filtración.

**Confirmación:** ningún secreto está en el código. Todos se leen de variables de entorno; `env.example` se versiona **sin un solo valor** (sin punto inicial, ver ADR 0005); `.env` y `.env.*` van en `.gitignore`; y **GitHub Secrets no guarda ninguna credencial real**, porque el pipeline corre con `WHATSAPP_TRANSPORT=log` y `ORDER_DRAFTER=rules` y no hace llamadas externas. Una filtración del repositorio no compromete nada de producción.

#### Tabla de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Estado |
|---|:-:|:-:|---|---|
| Prompt injection con consecuencias de negocio | Alta | Medio | Contrato del modelo sin campos de precio ni stock; recálculo en servidor; confirmación humana | **Implementada** |
| Webhook falsificado creando pedidos | Media | Alto | Firma `X-Twilio-Signature` validada con el SDK contra una URL fija, en tiempo constante; sin credenciales el webhook rechaza todo | **Implementada** |
| Pedido duplicado por reintento del proveedor | Alta | Medio | Índices únicos en `Message.providerMessageId` y `Order.sourceMessageId` | **Implementada** |
| Existencias negativas por confirmación concurrente | Media | Alto | `UPDATE` condicional dentro de una transacción | **Implementada** |
| Bypass de autorización vía server action | Media | Alto | `requireRole` dentro de cada handler, nunca sólo en middleware | **Implementada** |
| Simulador accesible en producción | Baja | Alto | `requireRole` **más** `SIMULATOR_ENABLED`; cubierto por el E2E | **Implementada** |
| Cantidad desmesurada en un mensaje (`600000 kg`) desborda el total y el mensaje se pierde | Media | Medio | Tope de 1000 por línea: fuera de rango la línea queda sin valorar, para revisión manual (`isValidLineQuantity`) | **Implementada** |
| Coste de AI disparado por abuso | Media | Medio | 10 mensajes cada 10 min por conversación, evaluado antes de invocar al proveedor (`US-03`) | **Implementada** |
| XSS vía `Message.body` o `OrderItem.rawText` | Baja | Alto | Escape por defecto de React; `dangerouslySetInnerHTML` prohibido | **Implementada** |
| Inyección SQL | Muy baja | Alto | Query builder de Prisma; el SQL crudo (bloqueo `FOR UPDATE` y recálculo de avisos) sólo con plantillas etiquetadas, que parametrizan; las variantes `*Unsafe` no se usan en `src/` | **Implementada** |
| Dependencia con vulnerabilidad conocida | Media | Medio | `npm audit --audit-level=high` en CI | **Implementada** |
| Fuerza bruta contra `/login` | Media | Alto | 5 fallos por cuenta cada 15 min, en memoria; hash señuelo contra la enumeración por tiempo. Falta límite por IP y persistencia entre reinicios | **Parcial** |
| **Sesión robada sin poder revocarla** | Baja | Alto | TTL de 8 h y rotación de `SESSION_SECRET`. No hay revocación individual | **Parcial** |
| **Volcado de base expone teléfonos y conversaciones** | Baja | Alto | Cifrado de volumen del proveedor. **Sin cifrado por campo** | **PREVISTA** |
| **Sin retención, purga ni derecho de supresión (nLPD)** | Alta | Medio | Ninguna. Requiere ventana de retención, purga y endpoint de borrado | **PREVISTA — deuda declarada** |
| **CSP estricta con nonce** | Media | Bajo | CSP base en producción con `'unsafe-inline'`; la versión con nonce no entra en el MVP | **Parcial** |
| **Sin DPA con Twilio ni con el proveedor de AI** | Alta | Medio | Ninguna. Es requisito de la nLPD para transferencia internacional | **PREVISTA — deuda declarada** |
| **Dos empleados confirman un total distinto del que revisaron** | Baja | Bajo | Ninguna. Se consideró un guardia optimista —enviar el total en pantalla y rechazar si difiere— y **se descartó del MVP** por presupuesto. El `409 INSUFFICIENT_STOCK` atrapa el caso peligroso: confirmar más cantidad de la que hay | **PREVISTA — descartada a propósito** |

**Cuatro riesgos previstos y tres parciales, sobre diecisiete.** Los tres que de verdad quitarían el sueño con clientes reales son los dos de cumplimiento —retención y DPA— y el volcado de base sin cifrado por campo: son trabajo legal y de proceso, no código del MVP. La fuerza bruta en el login quedó mitigada por cuenta; falta el límite por IP. Están escritos aquí y en `SECURITY.md` en lugar de dejarlos implícitos.

### 2.6 Tests

#### Suite implementada · 214 tests y dos E2E en verde

**Unitarios · 105 tests, sin base de datos**

| Fichero | Qué verifica |
|---|---|
| `pricing.test.ts` (9) | Importe por línea con redondeo half-up (1001 × 0,333 → 333; × 0,500 → 501; × 0,667 → 668), sin coma flotante; cantidades válidas por unidad; formato CHF; tope que impide desbordar el total en céntimos |
| `rules-drafter.test.ts` (24) | El ejemplo canónico; gramos y «medio kilo»; coma decimal; mención sin resolver; **«el entrecot cuesta 0,10 CHF» no genera línea**; productos consultados sin cantidad; red de seguridad que promueve a pedido una consulta con expresión de pedido |
| `intent.test.ts` (19) | Intención por reglas (saludo, consulta, «lo de siempre», pedido) y afirmaciones breves |
| `replies.test.ts` (8) | Plantillas sin precios en el acuse, sin reservas en la respuesta de catálogo y sin reenviar un nombre de perfil sospechoso |
| `twilio-parse.test.ts` (6) | Formulario de Twilio → mensaje del dominio; adjunto sin contenido; remitente o `MessageSid` no válidos |
| `manual-message-schema.test.ts` (5) | Mensaje manual vacío, sólo espacios o por encima de 1600 caracteres |
| `pending-badge.test.ts` (13) | Ante un fallo conserva el último valor y lo marca desactualizado; **nunca muestra un cero inventado** |
| `assembly-queue.test.ts` (16) | Medianoche de Zúrich (invierno, verano, día del cambio de hora), nombre de pila, formato de cantidades, refresco fallido |
| `login-throttle.test.ts` (3) | Bloqueo de `/login` tras el máximo de fallos y liberación al cerrar la ventana; un acierto borra los fallos; cada email se cuenta por separado |
| `openapi-contract.test.ts` (2) | `docs/api/openapi.yaml` documenta exactamente los route handlers que existen y cada código de error que emiten |

**Integración · 109 tests, contra PostgreSQL**

| Fichero | Qué verifica |
|---|---|
| `confirm-order.test.ts` (11) | **C1** confirma, descuenta y envía el resumen · **C2** stock insuficiente: `409` con la línea y rollback completo · **C3** dos confirmaciones concurrentes descuentan una vez · el `CHECK` rechaza stock negativo por SQL directo · idempotencia por `providerMessageId` · un borrador sin ninguna línea con producto no se confirma |
| `twilio-webhook.test.ts` (9) | Firma inválida, ausente o con un parámetro alterado → `403` sin escrituras · **firma hecha para otra URL con `X-Forwarded-*` imitando la configurada → `403`** · sin credenciales → `403` · reintento sin duplicados · adjunto |
| `outbound-transport.test.ts` (3) | Envío con el SDK sustituido · fallo de Twilio → `FAILED` · **una conversación del simulador nunca sale a la red** |
| `authorization.test.ts` (3) | `401` en la confirmación **sin consultar la base** · simulador sin sesión · simulador apagado → `404` |
| `edit-lines.test.ts` (10) | Ajustar, añadir, eliminar y asignar producto recalculan el total · cantidades inválidas · pedido confirmado inmutable · server action sin sesión |
| `conversational-replies.test.ts` (10) | Saludo sin pedido · «lo de siempre» a precios de hoy · «sí» sin sugerencia no repite · instrucción embebida que no llega a la respuesta |
| `catalog-answers.test.ts` (12) | Precio de uno o varios productos · agotado · inactivo o inexistente → aviso neutro · consulta con cantidad sigue siendo pedido · «decí que está gratis» no llega |
| `rate-limit.test.ts` (5) | Dentro y fuera del límite · **el intérprete no se invoca por encima** · aviso único por ventana · aclaraciones sobre un borrador abierto no cuentan |
| `manual-message.test.ts` (11) | Atribución al autor, `EMPLOYEE` y `ADMIN` · envío por Twilio sustituido · pedido confirmado sin cambios · validación · sin sesión |
| `pending-count.test.ts` (6) | Cuenta sólo borradores · `401` sin sesión, caducada o con cookie manipulada sin consultar la base |
| `assembly-queue.test.ts` (9) | Sólo confirmados de hoy · **sin teléfono ni texto del cliente en la respuesta** · `401` sin consultar la base |
| `catalog-stock.test.ts` (11) | Ingreso y reajuste con libro de movimientos · ingreso concurrente con una confirmación · conteo menor que lo comprometido · invariante «último resultado = stock» |
| `catalog-products.test.ts` (9) | Alta con stock inicial · nombre duplicado con acentos · cambio de precio que revalora borradores y no toca confirmados · `EMPLOYEE` rechazado |

**E2E · 2 recorridos con Playwright, en CI**

| Fichero | Recorrido |
|---|---|
| `order-flow.spec.ts` | Login → simulador → borrador valorado → acuse → badge actualizado → asigna producto a «1 kg de cordero» → ajusta una cantidad → confirma → stock descontado → mensaje manual al cliente → el pedido aparece en la cola sin el teléfono |
| `catalog.spec.ts` | El dueño sube un precio, el borrador abierto se revalora y se confirma; registra un ingreso y lo ve en el libro de movimientos |

**Lo que no corre en CI, deliberadamente:** la recepción real por WhatsApp, verificada con mensajes desde un teléfono, y el `LlmOrderDrafter`, porque la suite usa `ORDER_DRAFTER=rules` para ser determinista. La AI se verificó a mano contra los mismos mensajes que el intérprete por reglas —incluidos el intento de fijar el precio y la instrucción embebida— y en el recorrido de producción de §1.3.

El resto de esta sección es la estrategia de tests de la Entrega 1, que se conserva como registro del diseño.

**Los criterios Gherkin de §5 son los casos de prueba.** No se inventan casos nuevos: cada escenario de una historia es un test, y si un escenario no tiene test, la trazabilidad del final lo deja a la vista.

#### Tests unitarios · sin base de datos

Cubren la lógica de negocio de los módulos de `src/core/` y de `src/lib/`, invocada como funciones puras o casi puras. Ninguno arranca Next.js ni abre una conexión.

| Módulo | Qué se prueba |
|---|---|
| `src/core/orders/pricing.ts` | `lineTotalCents` = `quantity` × `unitPriceCents`; `totalCents` como suma; redondeo en enteros de céntimos |
| `src/core/drafting/rules.ts` | `RuleBasedOrderDrafter`: reconocimiento de cantidad, unidad y alias; mención no resuelta que conserva `rawText` |
| `src/core/drafting/schema.ts` | `DraftSchema` acepta una salida válida y **rechaza campos de precio o disponibilidad** si el modelo los incluye |
| `src/core/drafting/index.ts` | Selección de intérprete y caída al respaldo ante error, timeout o esquema inválido |
| `src/lib/whatsapp/signature.ts` | Firma válida, firma alterada, firma ausente; comparación en tiempo constante |
| `src/core/stock/adjust.ts` | Cantidad fraccionaria rechazada si `Product.unit` es `PIECE`; límite inferior de cero |
| `src/components/PendingBadge.tsx` | Ante fallo de consulta conserva el último valor y lo marca desactualizado, **nunca muestra cero** |

Es el nivel más barato y el que más comportamiento cubre: la separación de `src/core/` respecto de los route handlers (§2.3) existe precisamente para que estas reglas se puedan verificar sin levantar la aplicación.

#### Tests de integración · contra PostgreSQL de test

Ejercitan los endpoints de §4 de extremo a extremo del proceso —autorización, validación, dominio y persistencia— y **verifican el código de estado y la forma del cuerpo contra el contrato**, incluidos los de error y los de autorización.

| Endpoint | Casos |
|---|---|
| `POST /api/webhooks/twilio` *(diseñado como `/whatsapp` para Meta)* | **200** con firma válida y `Message` persistido · **403** con firma inválida y **cero escrituras** · **200** en entrega repetida sin duplicar · **200** en evento de estado sin crear `Message` · **400** con cuerpo no conforme · **413** por encima de 1 MiB |
| `POST /api/simulator/messages` | **200** con rol válido, devolviendo el borrador generado · **401** sin sesión · **404** con `SIMULATOR_ENABLED=false`, aun autenticado · **400** con número o texto no conformes |
| `POST /api/orders/{orderId}/confirm` | **200** con descuento de `stockQuantity` · **200** idempotente en la segunda llamada, sin segundo descuento ni segundo resumen · **409 `INSUFFICIENT_STOCK`** con la línea y la cantidad disponible · **422 `ORDER_HAS_NO_LINES`** sin líneas con producto · **401** sin sesión, **sin consultar la base** · **404** inexistente · **400** con `orderId` fuera del patrón `cuid` |
| Server actions del backoffice | Rechazo en servidor al invocarlas **sin sesión**, y al editar líneas de un `Order` en `CONFIRMED` |

Cada respuesta se valida contra el `components.schemas` correspondiente de §4, de modo que una divergencia entre el contrato publicado y la implementación pone la suite roja.

**Base de datos de test:** una base dedicada, `prisma migrate deploy` antes de la suite y truncado de tablas entre casos —más rápido que recrear el esquema—. En CI es un servicio `postgres` del propio job.

#### Test E2E · un único recorrido

Un solo test, en `tests/e2e/order-flow.spec.ts`, que recorre el flujo principal completo:

> Un cliente escribe su pedido en lenguaje natural al WhatsApp de la carnicería, el sistema ingiere el mensaje, lo interpreta contra el catálogo y el stock vigente y genera una propuesta de pedido en borrador con los precios recalculados en el servidor, notifica al empleado en el backoffice, que revisa las líneas, ajusta cantidades y —si hace falta— responde al cliente por el mismo chat antes de confirmar, momento en el que el pedido pasa a confirmado, el stock se descuenta en la misma transacción, el cliente recibe el resumen por WhatsApp y el pedido aparece en la pantalla del local para su armado.

Corre **contra el simulador**, no contra Twilio: sin red externa, sin credenciales y sin no determinismo. Y **con `ORDER_DRAFTER=rules`**, para que el resultado sea el mismo en cada ejecución.

Verifica en un solo recorrido: el `Order` aparece en `DRAFT` con sus líneas valoradas, el indicador de pendientes lo refleja, el empleado ajusta una cantidad, **confirma en dos interacciones desde el listado**, el `Product.stockQuantity` queda descontado, se registra un `Message` `OUTBOUND` con el resumen, y el pedido aparece en `/dashboard`.

Existe para comprobar que **las piezas están bien conectadas**, no para verificar reglas: las reglas ya están cubiertas más abajo en la pirámide, donde es más barato.

#### Herramientas

| Herramienta | Para qué | Por qué ésta |
|---|---|---|
| **Vitest** | Unitarios e integración | TypeScript y ESM nativos, sin la configuración de transformadores que Jest arrastra con Next 15. Una sola configuración para los dos niveles |
| **Playwright** | El único E2E | Navegador real, imprescindible para aserir «dos interacciones». Su espera automática reduce la fragilidad, y corre headless en CI sin configuración extra |
| **PostgreSQL como servicio de GitHub Actions** | Base de test en CI | Más simple que Testcontainers, que se descartó en `design.md` (D16): añade Docker dentro de CI y arranque por suite a cambio de una reproducibilidad que aquí no hace falta |
| **`vi.mock` de Vitest, con moderación** | Dobles puntuales | **La arquitectura reduce la necesidad de mocks**: en vez de simular el proveedor de AI o el de WhatsApp, se cambia la implementación por variable de entorno — `ORDER_DRAFTER=rules`, `WHATSAPP_TRANSPORT=log`. Es la ventaja concreta de la frontera de adaptadores de §2.2 |

**Sin umbral de cobertura.** No se pone una puerta de porcentaje: con 28 tareas y 3 h de presupuesto, un umbral empuja a escribir tests de lo fácil para llegar al número, en vez de tests de lo que rompe. La puerta de calidad es la tabla de trazabilidad de abajo — que cada escenario tenga su test — no una cifra.

#### Trazabilidad · criterios Gherkin de §5 a tipo de test

Los once criterios de aceptación de las tres historias documentadas en ficha completa.

| Historia | Criterio Gherkin | Tipo de test | Dónde |
|---|---|---|---|
| **US-04b** | 1 · Pedido reconocido por el intérprete con IA *(happy)* | **Integración** con doble del proveedor | `tests/integration/drafting.test.ts` |
| **US-04b** | 2 · El componente de AI no responde *(error)* | **Unitario** del selector + **integración** de `draftedBy` = `FALLBACK` | `tests/unit/drafting.test.ts` |
| **US-04b** | 3 · Salida de AI que no cumple el esquema *(error)* | **Unitario** — validación de `DraftSchema` y caída al respaldo | `tests/unit/drafting.test.ts` |
| **US-04b** | 4 · Respuesta tardía del proveedor *(edge)* | **Unitario** con temporizadores falsos ⚠ | `tests/unit/drafting.test.ts` |
| **US-07** | 1 · Confirmación sin ajustes desde el listado *(happy)* | **E2E** — es el único nivel que puede contar interacciones | `tests/e2e/order-flow.spec.ts` |
| **US-07** | 2 · Aparece un `Order` nuevo | **Integración** del endpoint de conteo + **E2E** del indicador | `tests/integration/orders.test.ts` |
| **US-07** | 3 · No se puede consultar los pendientes *(error)* | **Unitario** del componente con consulta forzada a fallar | `tests/unit/pending-badge.test.tsx` |
| **US-07** | 4 · Dos empleados sobre la misma lista *(edge)* | **Integración** — dos sesiones, confirmación concurrente | `tests/integration/orders.test.ts` |
| **US-11** | 1 · Acuse tras un pedido recibido *(happy)* | **Integración** con transporte en modo `log` | `tests/integration/messaging.test.ts` |
| **US-11** | 2 · El envío falla *(error)* | **Integración** con transporte forzado a fallar; `Message.status` = `FAILED` y `Order` intacto | `tests/integration/messaging.test.ts` |
| **US-11** | 3 · Reintento de confirmación *(edge)* | **Integración** — dos llamadas, un solo resumen | `tests/integration/messaging.test.ts` |

**Los once criterios tienen test asignado.** Tres advertencias honestas sobre la calidad de esa cobertura:

- **US-04b escenario 4 ⚠ es el más débil.** «Ignorar una respuesta que llega tarde» es una condición de carrera; con temporizadores falsos se prueba la rama del código, no el comportamiento real bajo concurrencia. Queda cubierto en el sentido de que la lógica se ejercita, no en el de que el problema esté demostrado.
- **La ruta real del proveedor de AI no se ejercita nunca en CI.** La suite corre con `ORDER_DRAFTER=rules` y el escenario 1 de US-04b usa un doble. Eso es deliberado —CI determinista y sin credenciales—, pero significa que **el E2E valida la tubería, no la calidad de la interpretación**. La única verificación de que el LLM entiende bien es manual, y así queda declarado.
- **US-07 escenario 3 se prueba a nivel de componente, no de sistema.** Forzar un fallo real de PostgreSQL dentro del E2E costaría más de lo que aporta; se verifica que el componente reacciona bien ante una consulta que rechaza.

Las doce historias restantes de §5 no tienen ficha completa y por tanto no aparecen aquí, pero sus escenarios están en `openspec/specs/` y son igualmente la fuente de sus tests.

---

## 3. Modelo de datos

Ocho entidades. Cada una existe porque al menos una historia de §5 la necesita; no hay ninguna previsora. Los nombres coinciden exactamente con los de §1.2 y §5.

### Diagrama entidad-relación

```mermaid
erDiagram
    Customer     ||--|| Conversation : "tiene exactamente una"
    Conversation ||--o{ Message      : "agrupa"
    User         |o--o{ Message      : "redacta via sentByUserId"
    Customer     ||--o{ Order        : "realiza"
    Conversation ||--o{ Order        : "origina"
    Message      |o--o| Order        : "da lugar a via sourceMessageId"
    User         |o--o{ Order        : "confirma via confirmedByUserId"
    Order        ||--|{ OrderItem    : "se compone de"
    Product      |o--o{ OrderItem    : "se resuelve a"
    Product      ||--o{ StockMovement : "explica sus existencias"
    User         ||--o{ StockMovement : "origina"
    Order        |o--o{ StockMovement : "descuenta via orderId"

    User {
        String id PK
        String email UK "not null"
        String passwordHash "not null, hash argon2id"
        UserRole role "not null, enum(ADMIN, EMPLOYEE)"
    }

    Customer {
        String id PK
        String phoneE164 UK "not null, DATO PERSONAL"
        String profileName "nullable, DATO PERSONAL"
    }

    Conversation {
        String id PK
        String customerId FK, UK "not null, 1 a 1 con Customer"
        DateTime lastInboundAt "nullable, ventana de 24 h del canal"
    }

    Message {
        String id PK
        String conversationId FK "not null"
        String sentByUserId FK "nullable, solo si direction OUTBOUND"
        String providerMessageId UK "nullable, idempotencia de la ingesta"
        MessageDirection direction "not null, enum(INBOUND, OUTBOUND)"
        MessageChannel channel "not null, enum(WHATSAPP, SIMULATOR)"
        String body "not null, DATO PERSONAL"
        MessageStatus status "nullable, enum(SENT, FAILED)"
    }

    Order {
        String id PK
        String reference UK "not null, visible en la pantalla del local"
        String customerId FK "not null"
        String conversationId FK "not null, redundante, ver decision 5"
        String sourceMessageId FK, UK "not null, un Order por Message"
        String confirmedByUserId FK "nullable, se escribe al confirmar"
        OrderStatus status "not null, default DRAFT, enum(DRAFT, CONFIRMED)"
        DraftOrigin draftedBy "not null, enum(AI, FALLBACK)"
        Int totalCents "not null, default 0, calculado en servidor"
        DateTime confirmedAt "nullable, se escribe al confirmar"
    }

    OrderItem {
        String id PK
        String orderId FK "not null"
        String productId FK "nullable, null si la linea no se resolvio"
        String rawText "not null, texto original del cliente"
        Decimal quantity "not null, precision 10 escala 3"
        Int unitPriceCents "not null, copiado del Product al crear"
        Int lineTotalCents "not null, calculado en servidor"
        Boolean hasStockWarning "not null, default false"
    }

    Product {
        String id PK
        String slug UK "not null"
        String name "not null"
        ProductUnit unit "not null, enum(WEIGHT_KG, PIECE)"
        Int pricePerUnitCents "not null"
        Decimal stockQuantity "not null, default 0, precision 10 escala 3"
        Boolean isActive "not null, default true"
    }

    StockMovement {
        String id PK
        String productId FK "not null"
        String userId FK "not null"
        String orderId FK "nullable, solo ORDER_CONFIRMED"
        StockMovementType type "not null, enum(INTAKE, COUNT_ADJUSTMENT, ORDER_CONFIRMED)"
        Decimal previousQuantity "not null"
        Decimal quantityDelta "not null"
        Decimal resultingQuantity "not null"
        Decimal countedQuantity "nullable, solo COUNT_ADJUSTMENT"
        Decimal committedQuantity "nullable, solo COUNT_ADJUSTMENT"
        String reason "nullable, obligatorio en COUNT_ADJUSTMENT"
    }
```

**Relación N:M resuelta.** `Order` y `Product` son N:M en el dominio —un pedido lleva varios productos, un producto aparece en varios pedidos— y se resuelve con `OrderItem` como entidad asociativa. `OrderItem` no es una tabla puente pura: lleva atributos propios (`quantity`, `unitPriceCents`, `lineTotalCents`, `rawText`, `hasStockWarning`), que es precisamente lo que obliga a modelarla como entidad y no como relación implícita.

**Fuera del diagrama, a propósito.** Cada tabla lleva `createdAt` y `updatedAt` gestionados por Prisma (`@default(now())` y `@updatedAt`), que se omiten arriba para no ensuciar el ER. **Una excepción importante:** `Message.createdAt` **no es sólo metadato** — es el campo sobre el que `US-03` cuenta los mensajes de la ventana para aplicar el límite por cliente, así que tiene un índice compuesto con `conversationId`. `Order.confirmedAt` y `Conversation.lastInboundAt` sí aparecen en el diagrama porque son datos de negocio, no marcas del sistema. La única tabla de registro es `StockMovement` (`US-15`), que explica cada variación de existencias y no lleva `updatedAt` porque nunca se edita; la trazabilidad de quién confirmó qué sigue viviendo en `Order.confirmedByUserId` y `Order.confirmedAt`.

### Entidades

#### `User`
Personal de la carnicería con acceso al backoffice. Se siembra; no hay autorregistro.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `email` | String | UK, not null | Credencial de acceso |
| `passwordHash` | String | not null | Hash argon2id. **Nunca la contraseña** |
| `role` | `UserRole` | not null | `ADMIN` o `EMPLOYEE` |

#### `Customer`
Persona que escribe por WhatsApp. **No es un rol del sistema**: no tiene cuenta ni se autentica.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `phoneE164` | String | UK, not null | Número en formato E.164. Identificador, **nunca credencial** |
| `profileName` | String | nullable | Nombre de perfil de WhatsApp. No verificado: lo elige el cliente |

#### `Conversation`
Hilo único y abierto por cliente. Agrupa todos sus mensajes en ambos sentidos.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `customerId` | String | FK → `Customer`, UK, not null | El índice único impone la regla «una conversación por cliente» en la base |
| `lastInboundAt` | DateTime | nullable | Último mensaje entrante. Permite saber si la ventana de 24 h del canal sigue abierta |

#### `Message`
Cada mensaje de la conversación, entrante o saliente.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `conversationId` | String | FK → `Conversation`, not null | Hilo al que pertenece |
| `sentByUserId` | String | FK → `User`, nullable | Qué `User` lo escribió. Vacío si lo generó el sistema |
| `providerMessageId` | String | UK, nullable | Identificador del proveedor. **Su índice único es lo que da la idempotencia de `US-01`.** Vacío para `channel` `SIMULATOR` |
| `direction` | `MessageDirection` | not null | `INBOUND` o `OUTBOUND` |
| `channel` | `MessageChannel` | not null | `WHATSAPP` o `SIMULATOR` |
| `body` | String | not null | Contenido. Inmutable una vez escrito |
| `status` | `MessageStatus` | nullable | Sólo para `OUTBOUND`: `SENT` o `FAILED` |

#### `Order`
Pedido, desde la propuesta hasta la confirmación.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `reference` | String | UK, not null | Referencia corta legible. Es lo que se muestra en la pantalla del local |
| `customerId` | String | FK → `Customer`, not null | Cliente |
| `conversationId` | String | FK → `Conversation`, not null | Hilo de origen (ver decisión 5) |
| `sourceMessageId` | String | FK → `Message`, UK, not null | Mensaje que lo originó. **El índice único impide un segundo pedido para el mismo mensaje** |
| `confirmedByUserId` | String | FK → `User`, nullable | Quién confirmó. Vacío mientras está en `DRAFT` |
| `status` | `OrderStatus` | not null, default `DRAFT` | `DRAFT` o `CONFIRMED` |
| `draftedBy` | `DraftOrigin` | not null | `AI` o `FALLBACK`, según qué intérprete produjo la propuesta |
| `totalCents` | Int | not null, default 0 | Suma de las líneas, en céntimos. Siempre recalculado en servidor |
| `confirmedAt` | DateTime | nullable | Momento de la confirmación |

#### `OrderItem`
Línea de pedido. Entidad asociativa entre `Order` y `Product`, con atributos propios.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `orderId` | String | FK → `Order`, not null | Pedido al que pertenece. Borrado en cascada |
| `productId` | String | FK → `Product`, nullable | **Vacío si la mención no se resolvió contra el catálogo** |
| `rawText` | String | not null | Texto original del cliente para esta línea. Se conserva siempre |
| `quantity` | Decimal(10,3) | not null | Cantidad en la unidad del producto |
| `unitPriceCents` | Int | not null | Precio unitario **copiado del `Product` al crear la línea** |
| `lineTotalCents` | Int | not null | `quantity` × `unitPriceCents`, calculado en servidor |
| `hasStockWarning` | Boolean | not null, default false | La cantidad supera el `stockQuantity` disponible |

#### `Product`
Catálogo con sus existencias. Se siembra, y desde `US-15` el `ADMIN` da de alta productos y cambia precios en `/admin/products`; no hay baja ni edición de nombre o unidad.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `slug` | String | UK, not null | Clave estable para el seed y para los alias del intérprete |
| `name` | String | not null | Nombre visible |
| `unit` | `ProductUnit` | not null | `WEIGHT_KG` o `PIECE`. Determina si admite fracciones |
| `pricePerUnitCents` | Int | not null | Precio vigente por unidad, en céntimos |
| `stockQuantity` | Decimal(10,3) | not null, default 0 | Existencias. **Nunca por debajo de cero** |
| `isActive` | Boolean | not null, default true | Un producto inactivo no se propone, pero los pedidos históricos lo conservan |

#### `StockMovement`
Libro de existencias (`US-15`). Un asiento por cada variación de `Product.stockQuantity`, insertado en la misma transacción que la produce. Inmutable.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `productId` | String | FK → `Product`, not null | Índice compuesto con `createdAt` para el historial |
| `type` | `StockMovementType` | not null | `INTAKE` (envasado o alta), `COUNT_ADJUSTMENT` (conteo físico) u `ORDER_CONFIRMED` (descuento al confirmar) |
| `previousQuantity`, `quantityDelta`, `resultingQuantity` | Decimal(10,3) | not null | Antes, variación y después. **El `resultingQuantity` del último asiento coincide con `stockQuantity`** |
| `countedQuantity`, `committedQuantity` | Decimal(10,3) | nullable | Sólo en el reajuste: lo contado y lo comprometido hoy en pedidos confirmados; disponible = contado − comprometido |
| `reason` | String | nullable | Motivo; obligatorio en el reajuste (validado en servidor) |
| `userId` | String | FK → `User`, not null | Quién lo originó; en `ORDER_CONFIRMED`, quien confirmó |
| `orderId` | String | FK → `Order`, nullable | Pedido que lo originó, sólo en `ORDER_CONFIRMED` |

### Enumeraciones

| Enum | Valores | Usado en |
|---|---|---|
| `UserRole` | `ADMIN`, `EMPLOYEE` | `User.role` |
| `MessageDirection` | `INBOUND`, `OUTBOUND` | `Message.direction` |
| `MessageChannel` | `WHATSAPP`, `SIMULATOR` | `Message.channel` |
| `MessageStatus` | `SENT`, `FAILED` | `Message.status` |
| `OrderStatus` | `DRAFT`, `CONFIRMED` | `Order.status` |
| `DraftOrigin` | `AI`, `FALLBACK` | `Order.draftedBy` |
| `ProductUnit` | `WEIGHT_KG`, `PIECE` | `Product.unit` |

`OrderStatus` **no incluye un valor de rechazo**: no existe ningún Requirement ni escenario que lo describa, y un valor de enumeración sin comportamiento detrás es una invitación a que alguien lo escriba por su cuenta.

### Cinco decisiones de modelado

**1 · `stockQuantity` es un campo de `Product`, no una entidad `StockItem`**
Sería una relación 1-a-1 estricta sin atributos propios. Separarla añadiría una tabla, un `join` en cada consulta de propuesta y una fila más en el seed.
*Trade-off:* se pierde el historial de movimientos de existencias, que una tabla aparte daría gratis. No lo pide ninguna historia, y `Order.confirmedAt` más `Order.confirmedByUserId` cubren la trazabilidad que sí importa.
*Revisión posterior:* `US-15` sí lo pidió. El historial se añadió como libro de movimientos (`StockMovement`, migración `add_stock_movement`), y `stockQuantity` sigue en `Product` como saldo vigente.

**2 · Dinero en `Int` de céntimos, cantidades en `Decimal(10,3)`**
Ningún importe es coma flotante. Las cantidades usan decimal exacto con tres posiciones, suficiente para gramos.
*Trade-off:* hay que convertir en cada frontera de entrada y salida, y `Decimal` de Prisma no es un `number` de JavaScript, lo que obliga a operar con la librería. A cambio elimina por completo los errores de redondeo en un sistema que cobra por peso, donde un céntimo mal calculado es dinero real.

**3 · `OrderItem.productId` es nullable, y `rawText` está siempre**
Una mención que el intérprete no resuelve se persiste igual, con `productId` vacío y el texto original conservado.
*Trade-off:* toda consulta que recorra líneas tiene que contemplar el caso sin producto, y el `join` es externo. La alternativa —descartar la línea, o inventar un producto— sería peor: descartar pierde información que el empleado necesita, e inventar rompe el principio de que el intérprete no crea datos de catálogo.

**4 · `unitPriceCents` se copia en la línea al crearla**
La línea guarda el precio vigente en el momento, no una referencia al precio actual del `Product`.
*Trade-off:* duplica un dato y abre la puerta a que línea y catálogo discrepen si alguien cambia el precio. Es exactamente lo que se busca: **un pedido confirmado debe conservar el precio con el que se confirmó.** Sin la copia, subir el precio del entrecot reescribiría retroactivamente el total de todos los pedidos pasados.

**5 · `Order` lleva tres claves foráneas transitivamente redundantes**
`customerId`, `conversationId` y `sourceMessageId` son derivables entre sí: el mensaje pertenece a una conversación, y la conversación es 1-a-1 con el cliente.
*Trade-off:* denormalización deliberada para que el listado del backoffice no necesite dos `join` por fila. `sourceMessageId` con índice único, además, **convierte la idempotencia de `US-01` en una garantía estructural** en vez de una comprobación procedimental. **`conversationId` es el eslabón que sobra**: con `Conversation` 1-a-1 con `Customer`, se alcanza en un solo salto desde `customerId`. Recomiendo eliminarlo; lo dejo marcado en el diagrama en lugar de quitarlo por mi cuenta porque `design.md` lo lista.

### Seguridad del modelo

#### Datos personales y sensibles

| Campo | Clasificación | Nota |
|---|---|---|
| `Customer.phoneE164` | **Dato personal directo** | Identifica a una persona física. Es la clave por la que se cruza todo lo demás |
| `Customer.profileName` | **Dato personal** | No verificado; lo elige el propio cliente |
| `Message.body` | **Dato personal** | Puede contener direcciones, horarios y hábitos que el cliente escribe por su cuenta |
| `Order` + `OrderItem` | **Dato personal por asociación** | Aislados no dicen nada; unidos a `customerId` revelan hábitos de compra de una persona identificada |
| `Conversation.lastInboundAt` | Metadato personal | Revela cuándo interactúa una persona concreta |
| `User.email` | Dato personal de empleado | |
| `User.passwordHash` | **Secreto** | Ver abajo |

Marco aplicable: **nLPD/revDSG suiza**, y GDPR si hay clientes de la UE. El modelo **no contiene** datos de pago, documentos de identidad ni categorías especiales — y las exclusiones de §1.2 están diseñadas para que siga siendo así.

#### Contraseñas

`User.passwordHash` almacena **exclusivamente un hash argon2id** con sal por usuario. Nunca la contraseña en claro, y nunca cifrado reversible: no existe ningún caso de uso que requiera recuperar el valor original, y por eso el algoritmo elegido no lo permite. No hay campo de contraseña de ningún otro tipo en el modelo. Alternativa aceptable si argon2id da problemas de instalación: bcrypt con coste ≥ 12.

#### Tokens y claves

**El modelo no almacena ningún token, clave ni secreto.** Es una propiedad del diseño, no una omisión:

- Los secretos de integración —`TWILIO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`— viven sólo en variables de entorno (§1.4).
- La sesión del backoffice es una **cookie firmada**, no una fila en base de datos: no hay tabla de sesiones que robar.
- `Message.providerMessageId` es un identificador opaco del proveedor, no una credencial. No autentica nada.

**Regla para cuando esto cambie:** si en el futuro se añade recuperación de contraseña, invitaciones o claves de API por cliente, cada token debe guardarse **hasheado** (nunca en claro), con **caducidad explícita** y marca de **un solo uso**, e invalidarse al consumirse. Hoy no aplica porque no existe ninguno.

#### Campos que nunca deben salir en una respuesta de la API

| Campo | Regla |
|---|---|
| `User.passwordHash` | **Nunca**, bajo ninguna circunstancia, para ningún rol |
| `Customer.phoneE164` | Sólo en el detalle del backoffice, para `EMPLOYEE` o `ADMIN` autenticado. **Prohibido en `/dashboard`**, que se exhibe donde hay clientes delante |
| `Message.body` | Sólo en el detalle del backoffice. **Prohibido en `/dashboard`** |
| `Customer.profileName` | Permitido en `/dashboard` sólo si se recorta a nombre de pila |
| `Message.providerMessageId` | No exponer: es un correlador con un tercero y no aporta nada al cliente de la API |
| `User.email` | Sólo para el propio usuario en sesión |

La proyección de `/dashboard` se implementa como una **consulta que no selecciona esos campos**, no como un filtrado posterior en la vista: lo que no se lee no se puede filtrar mal.

#### Aislamiento de datos: no hay, y es deliberado

**El modelo no tiene campo de aislamiento —ni `tenantId` ni equivalente— porque el sistema modela una sola carnicería.** No hay multi-tenant y no hay separación por usuario: cualquier `User` con rol `EMPLOYEE` puede leer y actuar sobre cualquier `Order`, `Conversation` y `Customer`, porque en un negocio de dos a seis personas es el comportamiento correcto.

Las dos consecuencias, dichas en voz alta:

1. **La autorización es por rol y por estado del recurso, nunca por pertenencia.** Un `Order` fuera de `DRAFT` no admite edición; un `Message` enviado es inmutable; sólo `ADMIN` modifica los datos identificativos de un `Customer`. No existe "mi pedido" frente a "tu pedido".
2. **El límite de seguridad es la autenticación misma.** Una sesión comprometida expone el conjunto completo de datos de clientes. No hay una segunda barrera que contenga el daño, y por eso la comprobación con `requireRole` dentro de cada operación del servidor —no en middleware, no ocultando botones— es la única defensa real.

**Qué haría falta el día que exista más de una carnicería:** un `tenantId` obligatorio en `User`, `Customer`, `Product` y `Order`; su propagación por `Conversation`, `Message` y `OrderItem` a través de sus raíces; y —lo que de verdad garantiza que ninguna consulta cruce el límite— una **extensión de cliente de Prisma que inyecte el filtro por `tenantId` en toda consulta**, de modo que omitirlo sea imposible por construcción y no una disciplina que alguien recuerda aplicar.

### Verificación

**Cada entidad participa en al menos una historia.** Ninguna sobra:

| Entidad | Historias que la usan |
|---|---|
| `User` | `US-06` (autenticación), `US-10` (`confirmedByUserId`), `US-11` y `US-12` (`sentByUserId`), `US-15` (autor del movimiento) |
| `Customer` | `US-01` (alta e identificación), `US-07` (detalle), `US-13` (cola) |
| `Conversation` | `US-01`, `US-07`, `US-11`, `US-12` |
| `Message` | `US-01`, `US-02`, `US-03`, `US-11`, `US-12` |
| `Product` | `US-04a`, `US-04b`, `US-05`, `US-10`, `US-15` |
| `StockMovement` | `US-10` (`ORDER_CONFIRMED`), `US-15` |
| `Order` | `US-04a`, `US-04b`, `US-05`, `US-07`, `US-08`, `US-10`, `US-13` |
| `OrderItem` | `US-04a`, `US-04b`, `US-05`, `US-08`, `US-10` |

**Cada escritura de las historias tiene dónde ir.** Recorrido completo: `US-01` escribe `Customer`, `Conversation` y `Message`; `US-02` escribe `Message` con `channel` `SIMULATOR`; `US-03` sólo lee, contando por `conversationId` y `createdAt`; `US-04a`/`US-04b` escriben `Order` y `OrderItem`, incluido `draftedBy`; `US-05` escribe `unitPriceCents`, `lineTotalCents`, `totalCents` y `hasStockWarning`; `US-06` sólo lee `User`; `US-07` sólo lee; `US-08` escribe y borra `OrderItem`; `US-10` escribe `Order.status`, `confirmedAt`, `confirmedByUserId`, decrementa `Product.stockQuantity` y registra un `StockMovement` por línea; `US-15` crea `Product`, escribe `pricePerUnitCents` (y revalora `OrderItem` y `Order.totalCents` en borrador) y `stockQuantity` con su `StockMovement`; `US-11` y `US-12` escriben `Message` con `direction` `OUTBOUND` y su `status`; `US-13` sólo lee.

**Dos huecos detectados al diseñar, resueltos en la implementación** sin cambiar el esquema:

- **`US-01`, escenario del adjunto:** el spec dice que se deja constancia del mensaje «sin su contenido», pero `Message.body` es `not null`. Se resuelve escribiendo un marcador generado por el sistema en lugar de dejarlo vacío, de modo que un adjunto rechazado sea distinguible de un mensaje vacío. La alternativa —hacer `body` nullable— introduce un estado ambiguo en la tabla más consultada del sistema.
- **`US-13`, nombre en la pantalla del local:** el spec pide «el nombre de pila», pero `Customer.profileName` es el nombre de perfil de WhatsApp, que puede ser un nombre completo o un apodo. Se recorta en la proyección de la consulta, no en la vista.

**Los nombres coinciden con §1 y §5.** Las siete entidades del diseño original y sus enums son exactamente los de `design.md`; la octava, `StockMovement`, y su enum `StockMovementType` llegaron con `US-15` y están especificados en el change `add-catalog-management`.

---
## 4. Especificación de la API

Seis endpoints: **tres que atraviesan el límite del sistema con efectos** —la entrada de WhatsApp vía Twilio, la entrada equivalente del simulador y la confirmación, que es el acto irreversible— y **tres de sólo lectura**: los dos que refresca el navegador (badge de pendientes y cola de armado) y el healthcheck de Railway.

> **Por qué el resto del backoffice no aparece aquí.** Las páginas de `/admin` y `/dashboard` son Server Components que consultan la base a través de `src/core/`: entre la interfaz y el dominio hay una llamada de función, no una petición HTTP. Las mutaciones del detalle —ajustar o asignar líneas, escribir al cliente— y las del catálogo —alta, precio, ingreso y reajuste de existencias— son **server actions**: endpoints HTTP internos de Next.js, sin contrato público, que igualmente ejecutan `requireRole` como primera línea y validan con Zod (§2.5). La **confirmación** es la única mutación con route handler propio, porque tiene contrato publicado y el test de integración la invoca dos veces en paralelo para verificar la idempotencia (D6).

### Límites del contrato

| Límite | Valor | Motivo |
|---|---|---|
| Texto de un mensaje entrante | **4096 caracteres** | Validado con Zod tras verificar la firma; un mensaje de WhatsApp real es mucho más corto |
| Mensaje manual del empleado | **1600 caracteres** | Límite de un mensaje de WhatsApp vía Twilio; se rechaza en vez de recortar lo que escribió una persona |
| Mensajes por cliente | **10 cada 10 minutos** | `US-03`: por encima, el mensaje se registra pero no se invoca a la AI |
| Subida de archivos | **No existe** | No hay ningún endpoint de subida. Los adjuntos de WhatsApp se rechazan sin descargarse (§1.2) |

### Contrato OpenAPI 3.0

El contrato vive en [`docs/api/openapi.yaml`](docs/api/openapi.yaml), que se puede abrir en Swagger UI o Redoc y pasa `redocly lint` sin errores. El test `tests/unit/openapi-contract.test.ts` falla si un route handler queda sin documentar, si se documenta uno que no existe o si un handler emite un código de error que el contrato no recoge. Se reproduce aquí para leerlo sin salir del documento:

```yaml
openapi: 3.0.3
info:
  title: Carnik API
  version: 1.2.0
  description: |
    Fronteras HTTP del sistema: la entrada real de mensajes de WhatsApp vía
    Twilio, la entrada equivalente del simulador interno, la confirmación del
    pedido —única operación con efectos irreversibles— y tres lecturas.

    Las mutaciones del backoffice (editar líneas, escribir al cliente,
    catálogo y existencias) son server actions de Next.js, sin contrato
    público: no aparecen aquí.

    Ningún esquema de respuesta expone `User.passwordHash` ni
    `Message.providerMessageId`. Sólo el simulador devuelve el borrador
    generado; ninguna respuesta incluye `Customer.phoneE164`.

    Un error no controlado del servidor responde `500` con la página de
    error de Next.js, no con el esquema `Error`.
servers:
  - url: https://srs-carnik-production.up.railway.app
    description: Producción
  - url: http://localhost:3000
    description: Desarrollo local

security:
  - sessionCookie: []

tags:
  - name: Mensajería
    description: Entrada de mensajes de clientes
  - name: Pedidos
    description: Confirmación y lecturas del backoffice
  - name: Operación
    description: Salud del servicio

paths:
  /api/webhooks/twilio:
    post:
      tags: [Mensajería]
      operationId: ingestTwilioMessage
      summary: Recibe un mensaje de WhatsApp desde Twilio
      description: |
        Punto de entrada de los mensajes reales de clientes. Se autoriza por
        la firma `X-Twilio-Signature`, validada con `twilio.validateRequest`
        contra la URL fija `TWILIO_WEBHOOK_URL`, nunca reconstruida desde
        cabeceras del proxy. Sin las cuatro variables `TWILIO_*` rechaza toda
        petición con 403 (fallo cerrado).

        La respuesta al cliente no viaja en el TwiML: sale por el transporte
        saliente, para que el simulador y el webhook compartan el mismo
        núcleo. Un adjunto no se descarga: se registra sin contenido y se
        pide el pedido por texto. La idempotencia la da el índice único de
        `Message.providerMessageId`, que guarda el `MessageSid`.
      security:
        - twilioSignature: []
      requestBody:
        required: true
        content:
          application/x-www-form-urlencoded:
            schema:
              $ref: '#/components/schemas/TwilioInboundForm'
      responses:
        '200':
          description: |
            Mensaje aceptado, también cuando es un reintento del mismo
            `MessageSid`, trae un adjunto, se suma a un borrador abierto o
            supera el límite por remitente: no son errores del emisor y un
            código de error provocaría reintentos.
          content:
            text/xml:
              schema:
                type: string
                example: '<Response/>'
        '400':
          description: |
            Firma válida pero formulario ilegible, `MessageSid` o remitente no
            conformes, o texto vacío sin adjuntos.
          content:
            text/xml:
              schema:
                type: string
                example: '<Response/>'
        '403':
          description: |
            Firma ausente o inválida (calculada para otra URL o con un
            parámetro alterado), o canal sin credenciales configuradas. No se
            persiste nada ni se invoca al proveedor de AI.
          content:
            text/xml:
              schema:
                type: string
                example: '<Response/>'

  /api/simulator/messages:
    post:
      tags: [Mensajería]
      operationId: simulateInboundMessage
      summary: Inyecta un mensaje entrante sin pasar por el proveedor
      description: |
        Produce exactamente el mismo efecto de dominio que el webhook, pero
        sin red externa ni credenciales. Es el canal que conduce el test E2E
        y el que permite demostrar el producto con el proveedor caído.

        Exige sesión con rol y además puede apagarse con
        `SIMULATOR_ENABLED`. Los mensajes salientes de una conversación
        simulada nunca salen a la red.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SimulatedMessageRequest'
            example:
              phoneE164: '+41791234567'
              profileName: Anna Muster
              text: Para el sábado quiero 2 kg de entrecot y 6 salchichas
      responses:
        '200':
          description: |
            Mensaje ingerido. La forma depende del resultado:

            - **borrador creado**: `messageId` y `order`;
            - **respuesta automática** (saludo, consulta, «lo de siempre» sin
              historial): `messageId`, `intent`, `reply` y `order: null`;
            - **límite por remitente**: `messageId`, `rateLimited: true`,
              `reply` (null si ya se avisó en la ventana) y `order: null`;
            - **sumado a un borrador abierto**: `messageId`,
              `appendedToOrderId` y `order: null`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SimulatedIngestResult'
        '400':
          description: Cuerpo que no es JSON, o número, nombre o texto no conformes
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationError'
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '404':
          description: |
            Canal deshabilitado por `SIMULATOR_ENABLED`. **Se responde 404 y
            no 403, antes incluso de mirar la sesión**: la existencia misma del
            canal es lo que no debe revelarse.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                code: NOT_FOUND
                message: No encontrado

  /api/orders/{orderId}/confirm:
    post:
      tags: [Pedidos]
      operationId: confirmOrder
      summary: Confirma un pedido y descuenta las existencias
      description: |
        Cambia el estado a `CONFIRMED` y descuenta la cantidad de cada línea
        con producto del `stockQuantity` de su producto, en una única
        transacción, dejando un `StockMovement` por línea. La suficiencia de
        existencias se comprueba al confirmar, con la fila del producto
        bloqueada, no cuando se generó el borrador.

        **Es idempotente:** confirmar dos veces devuelve 200 con el mismo
        pedido y `alreadyConfirmed: true`, sin descontar de nuevo, sin
        alterar `confirmedAt` y sin enviar un segundo resumen.

        **Sin cuerpo de petición.** El resumen al cliente se envía después
        de que la transacción confirme: un fallo de envío no revierte la
        venta y queda como `summaryMessage.status: FAILED`.
      parameters:
        - $ref: '#/components/parameters/OrderId'
      responses:
        '200':
          description: Pedido confirmado, o ya confirmado antes (reintento sin efectos)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderConfirmed'
        '400':
          description: '`orderId` con formato inválido. No se consulta la base'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                code: VALIDATION_ERROR
                message: Identificador de pedido no válido
        '401':
          $ref: '#/components/responses/Unauthenticated'
        '404':
          description: El pedido no existe
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                code: ORDER_NOT_FOUND
                message: Pedido no encontrado
        '409':
          description: |
            Alguna línea supera las existencias actuales. La transacción
            revierte entera: ni el estado ni las existencias cambian.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/InsufficientStock'
        '422':
          description: |
            El borrador no tiene ninguna línea con producto (todas sin
            reconocer o eliminadas). Sigue en `DRAFT` y no se envía nada al
            cliente.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                code: ORDER_HAS_NO_LINES
                message: 'El pedido no tiene líneas con producto: no se puede confirmar'

  /api/orders/pending-count:
    get:
      tags: [Pedidos]
      operationId: countPendingOrders
      summary: Número de pedidos en borrador, para el badge de la navegación
      description: |
        Lo consulta el navegador cada 10 s. `requireRole` se ejecuta antes de
        cualquier consulta. Respuesta con `Cache-Control: no-store`.
      responses:
        '200':
          description: Conteo vigente
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PendingCount'
        '401':
          $ref: '#/components/responses/Unauthenticated'

  /api/orders/assembly-queue:
    get:
      tags: [Pedidos]
      operationId: getAssemblyQueue
      summary: Cola de armado de la pantalla del local
      description: |
        Pedidos confirmados desde la medianoche de hoy en Europe/Zurich, del
        más antiguo al más reciente (máximo 100). Proyección cerrada en la
        consulta: sin teléfono, conversación ni texto del cliente. El
        navegador la refresca cada 20 s. Respuesta con
        `Cache-Control: no-store`.
      responses:
        '200':
          description: Cola vigente
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AssemblyQueue'
        '401':
          $ref: '#/components/responses/Unauthenticated'

  /api/health:
    get:
      tags: [Operación]
      operationId: health
      summary: Healthcheck de Railway
      description: Indica que el proceso responde. No comprueba la base de datos.
      security: []
      responses:
        '200':
          description: El proceso responde
          content:
            application/json:
              schema:
                type: object
                required: [ok]
                properties:
                  ok:
                    type: boolean
                    example: true

components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: carnik_session
      description: |
        Cookie de sesión cifrada (iron-session), `httpOnly`, `sameSite=lax` y
        `secure` en producción, con expiración absoluta de 8 h fijada al
        iniciar sesión. Transporta el identificador de `User` y su rol. Se
        obtiene en `/login` (server action). La comprobación se ejecuta dentro
        de cada handler; no hay `middleware.ts`. Roles admitidos: `EMPLOYEE`
        y `ADMIN`.
    twilioSignature:
      type: apiKey
      in: header
      name: X-Twilio-Signature
      description: |
        HMAC-SHA1, con `TWILIO_AUTH_TOKEN`, de `TWILIO_WEBHOOK_URL` más los
        parámetros del formulario ordenados. Es el único mecanismo de
        autorización del webhook, que no tiene sesión por necesidad.

  parameters:
    OrderId:
      name: orderId
      in: path
      required: true
      description: Identificador (`cuid`) del pedido. **Nunca se acepta `Order.reference`**
      schema:
        type: string
        pattern: '^c[a-z0-9]{20,32}$'
        example: cmg8k2m4p0001qz7h3f9a2b1c

  responses:
    Unauthenticated:
      description: Sin sesión válida o con rol no admitido. Se responde antes de consultar la base
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: UNAUTHENTICATED
            message: Sesión requerida

  schemas:
    OrderStatus:
      type: string
      enum: [DRAFT, CONFIRMED]
    DraftOrigin:
      type: string
      enum: [AI, FALLBACK]
      description: '`AI` si interpretó el LLM; `FALLBACK` si lo hizo el intérprete por reglas'
    MessageStatus:
      type: string
      enum: [SENT, FAILED]
    ProductUnit:
      type: string
      enum: [WEIGHT_KG, PIECE]

    Error:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          enum: [UNAUTHENTICATED, VALIDATION_ERROR, NOT_FOUND, ORDER_NOT_FOUND, ORDER_HAS_NO_LINES]
        message:
          type: string
          description: Texto legible para registro y depuración

    ValidationError:
      allOf:
        - $ref: '#/components/schemas/Error'
        - type: object
          properties:
            issues:
              type: array
              description: Problemas detectados por Zod, uno por campo
              items:
                type: object
                required: [path, message]
                properties:
                  code:
                    type: string
                    example: invalid_format
                  path:
                    type: array
                    items:
                      oneOf:
                        - type: string
                        - type: integer
                    example: [phoneE164]
                  message:
                    type: string
                    example: Número en formato E.164, p. ej. +41791234567
      example:
        code: VALIDATION_ERROR
        message: Datos no válidos
        issues:
          - code: invalid_format
            path: [phoneE164]
            message: Número en formato E.164, p. ej. +41791234567

    InsufficientStock:
      type: object
      required: [code, message, lines]
      properties:
        code:
          type: string
          enum: [INSUFFICIENT_STOCK]
        message:
          type: string
        lines:
          type: array
          description: Líneas cuya cantidad supera las existencias actuales
          items:
            type: object
            required: [orderItemId, productName, requested, available]
            properties:
              orderItemId:
                type: string
              productName:
                type: string
              requested:
                type: string
                description: Decimal con tres decimales, como cadena para no perder precisión
                example: '2.000'
              available:
                type: string
                example: '0.800'

    ProductRef:
      type: object
      description: Proyección mínima de Product. No expone stockQuantity
      required: [id, slug, name, unit]
      properties:
        id:
          type: string
        slug:
          type: string
          example: entrecot
        name:
          type: string
          example: Entrecot
        unit:
          $ref: '#/components/schemas/ProductUnit'

    OrderItemView:
      type: object
      required: [id, product, rawText, quantity, unitPriceCents, lineTotalCents, hasStockWarning, availableQuantity]
      properties:
        id:
          type: string
        product:
          type: object
          allOf:
            - $ref: '#/components/schemas/ProductRef'
          nullable: true
          description: null si la mención no se resolvió contra el catálogo
        rawText:
          type: string
          description: Fragmento original del mensaje para esta línea
          example: 2 kg de entrecot
        quantity:
          type: string
          description: Decimal(10,3) serializado como cadena
          example: '2.000'
        unitPriceCents:
          type: integer
          description: 0 si la línea no tiene producto
        lineTotalCents:
          type: integer
        hasStockWarning:
          type: boolean
        availableQuantity:
          type: string
          nullable: true
          description: Existencias del producto; sólo si hasStockWarning es true
          example: '1.500'

    OrderDraftView:
      type: object
      description: Borrador recién generado. Sin datos del Customer ni de la Conversation
      required: [id, reference, status, draftedBy, totalCents, currency, items]
      properties:
        id:
          type: string
        reference:
          type: string
          description: Seis últimos caracteres del id, en mayúsculas
          example: K2M4P0
        status:
          $ref: '#/components/schemas/OrderStatus'
        draftedBy:
          $ref: '#/components/schemas/DraftOrigin'
        totalCents:
          type: integer
        currency:
          type: string
          enum: [CHF]
        items:
          type: array
          items:
            $ref: '#/components/schemas/OrderItemView'

    SimulatedMessageRequest:
      type: object
      required: [phoneE164, text]
      properties:
        phoneE164:
          type: string
          pattern: '^\+[1-9]\d{6,14}$'
          description: Número del cliente simulado, en formato E.164
          example: '+41791234567'
        profileName:
          type: string
          maxLength: 100
          description: Nombre de perfil de WhatsApp simulado
          example: Anna Muster
        text:
          type: string
          minLength: 1
          maxLength: 4096
          description: Cuerpo del mensaje (se recortan espacios)

    SimulatedIngestResult:
      type: object
      required: [order]
      properties:
        messageId:
          type: string
          description: Identificador del Message entrante registrado
        order:
          type: object
          allOf:
            - $ref: '#/components/schemas/OrderDraftView'
          nullable: true
          description: Sólo si el mensaje abrió un borrador (pedido o «lo de siempre»)
        intent:
          type: string
          enum: [GREETING, QUESTION, REPEAT_LAST]
          description: Intención del mensaje cuando recibió una respuesta automática
        reply:
          type: string
          nullable: true
          description: Respuesta automática enviada
        appendedToOrderId:
          type: string
          description: Borrador abierto al que se sumó el mensaje, sin interpretarlo
        rateLimited:
          type: boolean
          description: El remitente superó el límite; el mensaje quedó registrado sin invocar a la AI
        duplicate:
          type: boolean
          description: Presente sólo en los caminos sin messageId (reintento o adjunto)

    OrderConfirmed:
      type: object
      required: [id, reference, status, totalCents, confirmedAt, confirmedByUserId, alreadyConfirmed, summaryMessage]
      properties:
        id:
          type: string
        reference:
          type: string
        status:
          type: string
          enum: [CONFIRMED]
        totalCents:
          type: integer
        confirmedAt:
          type: string
          format: date-time
        confirmedByUserId:
          type: string
          description: Quien confirmó primero; en un reintento puede ser otro usuario
        alreadyConfirmed:
          type: boolean
          description: true si la petición fue un reintento y no tuvo efectos
        summaryMessage:
          type: object
          nullable: true
          description: Resultado del envío del resumen al cliente; null si alreadyConfirmed
          required: [status, messageId]
          properties:
            status:
              $ref: '#/components/schemas/MessageStatus'
            messageId:
              type: string

    TwilioInboundForm:
      type: object
      required: [MessageSid, From]
      description: Sólo los campos que se usan; Twilio envía más y se ignoran
      properties:
        MessageSid:
          type: string
          pattern: '^[A-Z]{2}[0-9a-f]{32}$'
          description: Se almacena en providerMessageId y nunca se devuelve
        From:
          type: string
          example: 'whatsapp:+41791234567'
          description: Se le quita el prefijo `whatsapp:` y se valida como E.164
        Body:
          type: string
          maxLength: 4096
          default: ''
        ProfileName:
          type: string
          maxLength: 100
        NumMedia:
          type: integer
          minimum: 0
          default: 0
          description: Mayor que cero, el mensaje se registra sin su contenido

    PendingCount:
      type: object
      required: [count]
      properties:
        count:
          type: integer
          minimum: 0

    AssemblyQueue:
      type: object
      required: [orders, generatedAt]
      properties:
        generatedAt:
          type: string
          format: date-time
        orders:
          type: array
          maxItems: 100
          items:
            type: object
            required: [id, reference, customerName, confirmedAt, confirmedTime, lines]
            properties:
              id:
                type: string
              reference:
                type: string
              customerName:
                type: string
                description: Nombre de pila del perfil (máx. 24 caracteres), o «Cliente»
                example: Anna
              confirmedAt:
                type: string
                format: date-time
              confirmedTime:
                type: string
                description: Hora de confirmación HH:MM en Europe/Zurich
                example: '09:42'
              lines:
                type: array
                description: Sólo las líneas con producto
                items:
                  type: object
                  required: [id, productName, quantityLabel]
                  properties:
                    id:
                      type: string
                    productName:
                      type: string
                      example: Entrecot
                    quantityLabel:
                      type: string
                      example: 1.5 kg
```

### Por qué el mismo código para «no existe» y «no autorizado»

La regla se aplica **donde protege algo**, y en este contrato hay exactamente un sitio donde lo hace: **`POST /api/simulator/messages` responde 404 cuando `SIMULATOR_ENABLED=false`, incluso a un usuario autenticado y con rol válido.** Un 403 confirmaría que el canal existe y que sólo está apagado, y eso es justo lo que no interesa revelar: el simulador es una vía para crear pedidos sin pasar por la verificación de firma.

El segundo sitio es más sutil y va en la dirección del tiempo, no del código: en la confirmación, **el 401 se devuelve antes de consultar la base**, de modo que ni el cuerpo ni la latencia distinguen un `orderId` real de uno inventado.

Donde la regla **no** se aplica es entre usuarios autenticados. Como explica §3, este sistema **no tiene modelo de propiedad**: cualquier `EMPLOYEE` está autorizado sobre cualquier `Order`. Un 404 en lugar de 403 sólo oculta información a quien no debería tenerla; aquí el usuario habría podido ver ese pedido si existiera, así que el 404 genérico no le esconde nada y sí complica depurar. **Aplicar el patrón donde no protege es teatro de seguridad.**

El día que haya más de una carnicería esto cambia: entonces «existe pero es de otro negocio» **debe** responder 404, nunca 403.

### Ejemplos

#### 1 · Ingesta de un mensaje entrante

`POST /api/webhooks/twilio`, con `Content-Type: application/x-www-form-urlencoded` y la cabecera `X-Twilio-Signature`:

```
MessageSid=SM5c7f1e8a2b3d4c5e6f708192a3b4c5d6
&From=whatsapp%3A%2B41791234567
&To=whatsapp%3A%2B14155238886
&ProfileName=Marta
&NumMedia=0
&Body=Para+el+s%C3%A1bado+quiero+2+kg+de+entrecot+y+6+salchichas
```

```xml
<Response/>
```

El borrador y el acuse —«¡Gracias! Recibimos tu pedido. Anotamos: 2 kg Entrecot y 6 u. Salchicha Lyoner…»— se producen dentro de la misma petición; el acuse sale por la API de Twilio, no en el TwiML.

#### 2 · Mensaje simulado

`POST /api/simulator/messages`

```json
{
  "phoneE164": "+41791234567",
  "text": "Para el sábado quiero 2 kg de entrecot y 6 salchichas"
}
```

```json
{
  "messageId": "clx8m1z0000qz7h0a1b2c3d4",
  "order": {
    "id": "clx8k2m4p0001qz7h3f9a2b1c",
    "reference": "K2M4P0",
    "status": "DRAFT",
    "draftedBy": "AI",
    "totalCents": 8940,
    "currency": "CHF",
    "items": [
      {
        "id": "clx8k2m4p0002qz7h5e6f7g8h",
        "product": { "id": "clx8p1", "slug": "entrecot", "name": "Entrecot", "unit": "WEIGHT_KG" },
        "rawText": "2 kg de entrecot",
        "quantity": "2.000",
        "unitPriceCents": 3900,
        "lineTotalCents": 7800,
        "hasStockWarning": true,
        "availableQuantity": "1.500"
      },
      {
        "id": "clx8k2m4p0003qz7h9i0j1k2l",
        "product": { "id": "clx8p2", "slug": "salchicha-lyoner", "name": "Salchicha Lyoner", "unit": "PIECE" },
        "rawText": "6 salchichas",
        "quantity": "6.000",
        "unitPriceCents": 190,
        "lineTotalCents": 1140,
        "hasStockWarning": false,
        "availableQuantity": null
      }
    ]
  }
}
```

#### 3 · Confirmación

`POST /api/orders/clx8k2m4p0001qz7h3f9a2b1c/confirm` — sin cuerpo.

```json
{
  "id": "clx8k2m4p0001qz7h3f9a2b1c",
  "reference": "K2M4P0",
  "status": "CONFIRMED",
  "totalCents": 7290,
  "confirmedAt": "2026-08-01T08:24:11.000Z",
  "confirmedByUserId": "clx8u1",
  "alreadyConfirmed": false,
  "summaryMessage": { "status": "SENT", "messageId": "clx8m4" }
}
```

Y el caso de negocio, si alguien vendió el entrecot en el mostrador entretanto:

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "Una o más líneas superan las existencias disponibles",
  "lines": [
    {
      "orderItemId": "clx8k2m4p0002qz7h5e6f7g8h",
      "productName": "Entrecot",
      "requested": "1.500",
      "available": "0.800"
    }
  ]
}
```

### Diagrama de secuencia · confirmación del pedido

```mermaid
sequenceDiagram
    autonumber
    participant N as Navegador (backoffice)
    participant A as Route handler
    participant G as requireRole + Zod
    participant D as PostgreSQL
    participant W as Twilio (WhatsApp)

    N->>A: POST /api/orders/{orderId}/confirm
    A->>G: valida sesion, rol y orderId

    alt Sin sesion valida
        G-->>N: 401 UNAUTHENTICATED
        Note over G,D: No se consulta la base: la respuesta<br/>no revela si el Order existe
    else orderId malformado
        G-->>N: 400 VALIDATION_ERROR
    else Sesion y parametros validos
        G->>D: BEGIN transaccion
        D->>D: UPDATE Order SET status=CONFIRMED<br/>WHERE id=? AND status=DRAFT

        alt Afecta 0 filas y el Order ya estaba CONFIRMED
            D-->>A: ROLLBACK, sin efectos
            A-->>N: 200 respuesta idempotente
            Note over A,W: No se descuenta stock ni se<br/>envia un segundo resumen
        else Afecta 0 filas y el Order no existe
            D-->>A: ROLLBACK
            A-->>N: 404 ORDER_NOT_FOUND
        else Afecta 1 fila y ninguna linea tiene producto
            D-->>A: ROLLBACK
            A-->>N: 422 ORDER_HAS_NO_LINES
        else Afecta 1 fila
            D->>D: UPDATE Product SET stockQuantity -= q<br/>WHERE id=? AND stockQuantity >= q

            alt Alguna linea sin existencias suficientes
                D-->>A: ROLLBACK completo
                A-->>N: 409 INSUFFICIENT_STOCK
                Note over D: Ni el estado ni el stock cambian
            else Todas las lineas cubiertas
                D-->>A: COMMIT
                A->>W: Envia el resumen al cliente
                Note over A,W: Fuera de la transaccion: un fallo<br/>de red no revierte la venta
                A-->>N: 200 OrderConfirmed
            end
        end
    end
```

### Por qué estos tres

Son los tres únicos puntos donde una petición HTTP atraviesa el límite del sistema con efectos: **el mensaje entra desde Twilio, entra desde el simulador, y la decisión del empleado se ejecuta con efectos irreversibles sobre las existencias.** Los otros tres endpoints sólo leen y no hacen avanzar el flujo. Todo lo demás del backoffice —ajustar o asignar una línea, escribir al cliente, gestionar el catálogo— ocurre dentro del proceso, como server actions.

---

## 5. Historias de usuario

Quince historias derivadas de los 16 Requirements de la especificación. **La I de INVEST falla estructuralmente en este backlog: 12 de las 15 dependen de otra historia.** No es un defecto de redacción que quede por corregir — un producto que es una tubería, donde entra un mensaje, se interpreta, se revisa, se confirma y sale un mensaje, no admite historias priorizables en cualquier orden. Se documenta en cada ficha en lugar de fingir lo contrario, porque saberlo al planificar vale más que un INVEST donde todo aprueba.

Se desarrollan en ficha completa **tres** historias, elegidas por el arco narrativo del flujo E2E —**interpretación → decisión humana → valor entregado al cliente**— y no por su calidad de redacción. La entrada de mensajes (`US-01`) queda deliberadamente fuera de las fichas: es fontanería, falla la V y no produce nada observable. Está cubierta por el diagrama de §1.1 y aparece nombrada en las dependencias de la primera ficha. El resto figura en la tabla resumen del final.

---

### US-04b · Interpretar el pedido con IA y respaldo

**Como** empleado de la carnicería,
**quiero** que la interpretación entienda cómo escribe la gente de verdad y no sólo las frases que un parser sabe reconocer,
**para** que baje el número de `OrderItem` sin resolver por pedido y el empleado corrija menos líneas antes de confirmar.

**Descripción**
Implementa `LlmOrderDrafter`, la versión con modelo de lenguaje de la interfaz `OrderDrafter` cuyo contrato definió `US-04a`. La salida se valida contra `DraftSchema` antes de usarse: el intérprete dice qué `Product` y qué `quantity`, nunca `pricePerUnitCents` ni `stockQuantity`. Si el proveedor falla, agota el tiempo de espera o devuelve algo que no encaja en el esquema, `RuleBasedOrderDrafter` produce igualmente la propuesta y el `Order` queda con `draftedBy` = `FALLBACK`. Es la única historia del MVP cuyo trabajo no tiene criterio de terminación natural, y por eso lleva límite de tiempo explícito en vez de estimación.

**Criterios de aceptación**

```gherkin
Escenario 1: Pedido reconocido por el intérprete con IA (happy path)
  Dado un catálogo con el Product "Entrecot" cuya unit es WEIGHT_KG
  Cuando el cliente escribe "para el sábado quiero 2 kg de entrecot"
    Y el proveedor de AI responde dentro del tiempo de espera con una salida
      que cumple DraftSchema
  Entonces el sistema crea un Order en estado DRAFT
    Y crea un OrderItem con ese Product y quantity 2
    Y el Order queda con draftedBy AI

Escenario 2: El componente de AI no responde (error)
  Dado que el proveedor de AI devuelve un error o agota el tiempo de espera
  Cuando llega un Message de pedido
  Entonces el sistema genera la propuesta con RuleBasedOrderDrafter
    Y el Order queda igualmente en estado DRAFT y visible para el empleado
    Y el Order queda con draftedBy FALLBACK

Escenario 3: Salida de AI que no cumple el esquema (error)
  Dado que el componente de AI devuelve una respuesta con campos ausentes
       o de tipo incorrecto
  Cuando el sistema valida la propuesta contra DraftSchema
  Entonces descarta la salida y recurre a RuleBasedOrderDrafter
    Y no persiste ningún dato proveniente de la respuesta inválida

Escenario 4: Respuesta tardía del proveedor de AI (edge case)
  Dado que el tiempo de espera venció y RuleBasedOrderDrafter ya generó
       la propuesta
  Cuando la respuesta del proveedor de AI llega después
  Entonces el sistema la descarta sin usarla
    Y el Order conserva la propuesta del respaldo y su draftedBy FALLBACK
    Y no se crea un segundo Order para el mismo Message
```

*El camino feliz es el mismo contrato que verifica `US-04a`; lo que distingue a esta historia es el valor de `draftedBy`.*

**Requisitos no funcionales**

- **Seguridad — aislamiento de instrucciones:** el texto del `Message` es dato, nunca instrucción. `DraftResult` no contiene campos de precio, total ni disponibilidad, así que una instrucción embebida no tiene dónde aterrizar. La salida se valida contra `DraftSchema` antes de persistir nada; si no valida, se descarta entera.
- **Seguridad — quién puede ejecutarla:** nadie de forma directa. Se dispara desde la ingesta, y el modelo no tiene permiso de escritura sobre ninguna entidad: no puede modificar `Product.pricePerUnitCents`, `Product.stockQuantity` ni `Order.status`.
- **Privacidad:** al proveedor de AI se le envía únicamente el contenido del `Message` y el catálogo de `Product`. No se envía `Customer.phoneE164`, `Customer.profileName` ni el historial de `Order` del cliente.
- Timeout duro; superado, entra `RuleBasedOrderDrafter`. La generación de la propuesta **nunca falla**.
- Seleccionable en caliente con `ORDER_DRAFTER`; los tests corren siempre con `rules`.
- **Límite de tiempo explícito: 2,5 h.** Vencido, se entrega el sistema con `US-04a` y esta historia pasa a Should-Have documentado.

**Trazabilidad:** Funcionalidad §1.2 Must-Have #2 «Interpretación del pedido con AI» · Requirements «Generación de una propuesta de pedido desde texto libre» y «Aislamiento frente a instrucciones contenidas en el mensaje» de `ai-order-intake` · Entidades `Order`, `OrderItem`, `Product`, `Message`

**Dependencias:** **`US-01`**, que registra el `Message` entrante y sin la cual no hay texto que interpretar, y **`US-04a`**, que define el contrato `OrderDrafter` y provee `RuleBasedOrderDrafter` como respaldo. También `US-03`, cuyo límite se evalúa antes de invocar al proveedor. Ninguna historia depende de ésta: es descartable por diseño.

**Estimación:** 1,5 – 3 h (tarea 5.3), con límite duro de 2,5 h

**INVEST**

- **⚠ I — Independiente:** depende de `US-04a`, que define el contrato y provee el respaldo.
- **✓ N — Negociable:** el modelo, el umbral del timeout y la profundidad del prompt son todos acordables.
- **⚠ V — Valiosa:** es un habilitador técnico, y además su valor es *incremental sobre `US-04a`*, no absoluto: mejora la tasa de reconocimiento de un sistema que ya funciona.
- **✗ E — Estimable: NO.** Ajustar prompts no tiene criterio de terminación: siempre hay un caso más. El rango de 1,5–3 h es una decisión de presupuesto, no una estimación derivada del trabajo. Se gestiona con límite de tiempo.
- **✓ S — Pequeña:** una implementación de una interfaz existente.
- **⚠ T — Testeable:** el respaldo, la validación de esquema y el descarte de respuestas tardías son verificables de forma determinista. **La calidad de la interpretación no lo es** — no hay aserción que diga "entendió bien el pedido".

---

### US-07 · Ver el detalle y confirmar en dos toques

**Como** empleado de mostrador,
**quiero** ver de un vistazo qué pedidos esperan y resolverlos sin navegar entre pantallas,
**para** cerrar un `Order` que no necesita ajustes en **dos interacciones** desde la lista, atendiendo de pie y con un cliente esperando enfrente.

> **Alcance de la ficha.** Esta historia cubre además el listado de pendientes y su indicador, no sólo el detalle: falla la S de INVEST precisamente por eso, y se dejó sin dividir a propósito. El criterio de aceptación de las dos interacciones es lo que la define.

**Descripción**
El backoffice muestra la lista de `Order` en estado `DRAFT` con un indicador que se actualiza solo. Al abrir uno, todo lo necesario para decidir está en una sola pantalla: los `OrderItem` con su `hasStockWarning`, el `totalCents` y la `Conversation` que originó el pedido. Si no hace falta cambiar nada, se confirma desde ahí. El límite de dos interacciones no es una aspiración de diseño: es la traducción verificable de que quien usa esto lo hace con las manos ocupadas.

**Criterios de aceptación**

```gherkin
Escenario 1: Confirmación sin ajustes desde el listado (happy path)
  Dado un Order en estado DRAFT cuyos OrderItem son correctos y tienen
       stockQuantity suficiente
  Cuando el empleado lo confirma partiendo del listado de pendientes
  Entonces lo consigue en dos interacciones: abrir el detalle y confirmar
    Y no necesita abrir otra pantalla para ver los OrderItem, los avisos,
       el totalCents ni la Conversation

Escenario 2: Aparece un Order nuevo
  Dado un empleado con el backoffice abierto y sin pedidos pendientes
  Cuando llega un Message de cliente que genera un Order en estado DRAFT
  Entonces el indicador de pendientes lo muestra sin recarga manual

Escenario 3: El sistema no puede consultar los pendientes (error)
  Dado que la consulta de Order en estado DRAFT falla
  Cuando el backoffice intenta actualizar el indicador
  Entonces la interfaz conserva el último valor conocido y señala que
       está desactualizada
    Y no muestra cero pendientes como si no hubiera trabajo

Escenario 4: Dos empleados sobre la misma lista (edge case)
  Dado dos empleados con el backoffice abierto simultáneamente
  Cuando uno de ellos confirma un Order
  Entonces el Order deja de contarse como pendiente para ambos en la
       siguiente actualización
```

**Requisitos no funcionales**

- **Seguridad — quién puede ejecutarla:** rol `EMPLOYEE` o `ADMIN`. La comprobación se hace con `requireRole` dentro de la página y del endpoint del indicador, en el servidor. El middleware puede redirigir por comodidad, pero no es el control.
- **Seguridad — sobre qué recursos:** la lectura alcanza cualquier `Order`, `Conversation` y `Customer` del negocio; al ser una sola carnicería no hay modelo de propiedad. Ningún acceso anónimo obtiene datos de `Customer`.
- **Privacidad:** el detalle expone `Customer.profileName`, `Customer.phoneE164` y la `Conversation` completa. Es la pantalla con mayor exposición de datos personales del sistema, y por eso su control de acceso es el mismo que el del resto del backoffice, sin excepciones de conveniencia.
- **Ante un fallo de consulta, la interfaz nunca muestra cero.** Decir "no hay trabajo" cuando no se sabe es peor que mostrar un dato viejo señalado como tal.
- La actualización del indicador es por sondeo periódico: no hay infraestructura de tiempo real en el sistema.
- El detalle no pagina ni esconde la `Conversation` tras una pestaña. Todo en una pantalla es el requisito, no una preferencia.

**Trazabilidad:** Funcionalidad §1.2 Must-Have #3 «Backoffice de confirmación» · Requirement «Revisión con el mínimo número de acciones» de `order-confirmation` · Entidades `Order`, `OrderItem`, `Conversation`, `Message`, `Customer`

**Dependencias:** `US-05` (necesita `Order` con `totalCents` calculado), `US-06` (sesión y rol). Comparte la consulta parametrizada por `status` con `US-13`. Habilita `US-08`, `US-09`, `US-10` y `US-12`.

**Estimación:** 1,5 – 3 h (tareas 6.1 y 6.2)

**INVEST**

- **⚠ I — Independiente:** depende de `US-05` y `US-06`.
- **✓ N — Negociable:** el intervalo de refresco, la disposición visual y qué se muestra en la lista frente al detalle.
- **✓ V — Valiosa: la primera historia del backlog con valor observable.** Es la séptima de quince, un dato incómodo que conviene tener presente al planificar la demo.
- **✓ E — Estimable:** una consulta, una lista, un detalle y un componente de sondeo.
- **✗ S — Pequeña: NO.** Entrega dos cosas separables: la lista con su indicador, y el detalle desde el que se confirma. Se deja sin dividir a propósito: ambas mitades caben juntas en el presupuesto y separarlas duplicaría la contabilidad sin adelantar ninguna entrega.
- **✓ T — Testeable:** el límite de dos interacciones es aserible en el test E2E, que es lo que convirtió este requisito en verificable en lugar de aspiracional.

---

### US-11 · Respuesta al cliente

**Como** cliente de la carnicería,
**quiero** recibir confirmación por el mismo chat de que mi pedido llegó y de cómo quedó,
**para** no quedarme en silencio preguntándome si alguien lo leyó: acuse en menos de un minuto desde que escribo, y resumen con el detalle y el `totalCents` en cuanto el mostrador confirma.

**Descripción**
Dos `Message` con `direction` `OUTBOUND`, en dos momentos distintos. El acuse sale en cuanto la propuesta queda registrada y dice sólo que el pedido se recibió: no promete disponibilidad, ni precios, ni plazos, porque nada de eso está decidido todavía. El resumen sale al confirmar y refleja los `OrderItem` finales, con los ajustes que haya hecho el empleado, y el `totalCents`. Cada `Order` recibe un único resumen. Es el paso que cierra el bucle y el que convierte el sistema en algo que el cliente percibe.

**Criterios de aceptación**

```gherkin
Escenario 1: Acuse tras un pedido recibido (happy path)
  Dado un Message de cliente que genera un Order en estado DRAFT
  Cuando la propuesta queda registrada
  Entonces el sistema envía un acuse de recepción al cliente
    Y lo registra como Message con direction OUTBOUND en la Conversation

Escenario 2: El envío falla (error)
  Dado que el proveedor de mensajería devuelve un error, o que el último
       Message del cliente está fuera de la ventana que el canal permite
       para mensajes libres
  Cuando el sistema intenta enviar
  Entonces el fallo queda registrado y visible en la Conversation como no entregado
    Y el Order conserva su status y, si era CONFIRMED, su stockQuantity
       ya descontado
    Y el flujo de revisión no se bloquea

Escenario 3: Reintento de confirmación de un Order ya confirmado (edge case)
  Dado un Order en estado CONFIRMED cuyo resumen fue enviado
  Cuando se recibe una segunda petición de confirmación del mismo Order
  Entonces el sistema no envía un segundo resumen al cliente
```

**Requisitos no funcionales**

- **El acuse no compromete** disponibilidad, precios ni plazos. Es un acuse de recepción, no una confirmación: prometer antes de que una persona revise sería reintroducir el problema que el producto viene a resolver.
- **Un fallo de envío nunca revierte el `Order`.** Si estaba en `CONFIRMED`, sigue en `CONFIRMED` y el `stockQuantity` sigue descontado. La venta es real aunque el aviso no llegue; el empleado ve el fallo en el detalle. Es la inconsistencia correcta, y está elegida a propósito.
- El envío se ejecuta **fuera** de la transacción de `confirmOrder`: una llamada de red dentro de una transacción la mantiene abierta durante segundos y puede dejar el `Order` sin confirmar por un fallo ajeno.
- **Seguridad — quién puede ejecutarla:** nadie de forma directa; ambos mensajes son automáticos. Todo `Message` con `direction` `OUTBOUND` registra en `sentByUserId` qué `User` lo originó, o queda vacío si lo generó el sistema.
- **Seguridad — inmutabilidad:** un `Message` ya enviado no puede editarse ni borrarse desde la interfaz, por ningún rol.
- El transporte tiene un modo de sólo registro seleccionable con `WHATSAPP_TRANSPORT`, usado en tests y en CI, que no llama al proveedor.

**Trazabilidad:** Funcionalidad §1.2 Must-Have #1 «Conversación bidireccional por WhatsApp» · Requirement «Envío de mensajes al cliente por el mismo canal» de `whatsapp-conversation`, mitad automática · Entidades `Message`, `Conversation`, `Order`, `User`

**Dependencias:** `US-04a` y `US-04b` (disparan el acuse) y `US-10` (dispara el resumen). Comparte el módulo de transporte con `US-12`.

**Estimación:** 1 – 2 h (tarea 7.1 y parte de 7.2)

**INVEST**

- **⚠ I — Independiente:** depende de `US-04a` y `US-10` para sus dos disparadores.
- **✓ N — Negociable:** la redacción de ambos mensajes y si el acuse incluye o no un resumen provisional.
- **✓ V — Valiosa:** cierra el bucle con el cliente; sin ella el producto es mudo y volvemos al silencio que veníamos a resolver.
- **✓ E — Estimable:** una llamada HTTP y dos disparadores.
- **✗ S — Pequeña: NO.** Entrega tres cosas —el módulo de transporte, el acuse y el resumen— que se disparan en dos momentos distintos del flujo y fallan de formas distintas. Se deja sin dividir a propósito: el transporte no tiene sentido sin al menos un mensaje que enviar, y separar acuse de resumen daría dos historias de media hora.
- **✓ T — Testeable:** verificable sin red usando el modo de sólo registro.

---

### Tabla resumen de historias

Ordenada por posición en el flujo E2E, no por identificador.

| ID | Título | Posición en el flujo E2E | MoSCoW | Ficha completa | Entregada |
|---|---|---|---|:-:|:-:|
| `US-06` | Entrar al backoffice con credenciales y rol | Transversal · precondición de todo paso humano | Must | No | ✅ |
| `US-01` | Recibir los pedidos que llegan por WhatsApp | 1 · Entrada del mensaje | Must | No | ✅ |
| `US-03` | Limitar lo que un solo remitente puede consumir | 1 · Entrada · guardarraíl de coste | Must | No | ✅ |
| `US-02` | Simular mensajes entrantes sin depender de WhatsApp | 1 · Entrada · canal alternativo | Must | No | ✅ |
| `US-04a` | Convertir el texto en un pedido estructurado (determinista) | 2 · Interpretación | Must | No | ✅ |
| `US-04b` | Interpretar el pedido con IA y respaldo | 2 · Interpretación | Must | **Sí** | ✅ |
| `US-05` | Valorar el pedido contra el catálogo y las existencias | 3 · Valoración en servidor | Must | No | ✅ |
| `US-07` | Ver el detalle y confirmar en dos toques | 4 · Notificación y decisión humana | Must | **Sí** | ✅ |
| `US-08` | Ajustar las líneas de un pedido antes de confirmarlo | 5 · Ajuste | Must | No | ✅ |
| `US-09` | Corregir las existencias desde la propia línea | 5 · Ajuste | ~~Must~~ reemplazada por `US-15` | No | ↪ `US-15` |
| `US-12` | Responder al cliente desde el detalle del pedido | 6 · Diálogo · opcional en el flujo | Must | No | ✅ |
| `US-10` | Confirmar el pedido descontando las existencias | 7 · Confirmación · nudo del flujo | Must | No | ✅ |
| `US-11` | Respuesta al cliente | 8 · Valor entregado al cliente | Must | **Sí** | ✅ |
| `US-13` | Ver la cola de armado en la pantalla del local | 9 · Armado en el local | Must | No | ✅ |
| `US-14` | Responder consultas simples de precio y disponibilidad | Fuera del flujo E2E | **Could** | No · reincorporada, ver abajo | ✅ |
| `US-15` | Gestionar el catálogo, sus precios y sus existencias | Transversal · mantiene vigentes los datos contra los que se valora cada pedido | Must | No · spec en `openspec/specs/catalog-management/` | ✅ |
| `US-16` | Sugerir productos alternativos o complementarios (*upsell*) | 5 · Ajuste | **Could** | No | ⏭ |

### US-14: salió del MVP en la Entrega 1 y volvió como Could

`US-14` era la única Should-Have del backlog. Pasa a **Could-Have y queda fuera del MVP**, y la razón no es de presupuesto sino de su propia evaluación INVEST: **falla la E y falla la T**. Un clasificador de intención con umbral de confianza no tiene criterio de terminación —siempre hay un caso mal clasificado más—, así que cualquier cifra que le pusiéramos sería un presupuesto disfrazado de estimación. Y no es testeable en lo que importa: se puede aserir que no crea `Order`, que registra el `Message` y que calla cuando duda, pero **no existe aserción determinista que compruebe que clasifica bien**.

Eso importa por la asimetría del error. Clasificar una consulta como pedido genera un `Order` en `DRAFT` que alguien descarta en dos segundos. **Clasificar un pedido como consulta pierde una venta en silencio**: nadie se entera, no hay `Order` que revisar, no hay alerta, y el cliente cree que le contestaron. Es un modo de fallo invisible que ningún test del proyecto podría detectar, en un producto cuya premisa entera es que ningún pedido se pierda.

Sin ella, las preguntas simples quedan en la `Conversation` y las responde una persona — exactamente lo que ocurre hoy en la carnicería. El flujo E2E permanece íntegro: ninguna de las catorce historias restantes depende de `US-14`.

**Por qué volvió, y qué cambió para que fuera estimable y testeable.** Las dos objeciones se resolvieron por diseño, no por insistencia:

- **La E:** no hay un clasificador con umbral que ajustar. La intención —pedido, saludo, consulta o repetición— viaja como un campo más en la misma salida estructurada que ya devolvía las líneas del pedido (change `add-conversational-replies`), y los productos consultados como otro campo (`add-catalog-answers`). El trabajo tuvo un criterio de terminación concreto: los escenarios del spec.
- **La T:** el intérprete por reglas deriva la misma intención de forma determinista, así que la suite verifica cada escenario sin el LLM. La clasificación del LLM real se verificó a mano.
- **La asimetría del error**, que era la objeción de fondo, se cerró con una regla: **si el mensaje trae una cantidad o una expresión de pedido, es pedido**, clasifique lo que clasifique el modelo, y una red de seguridad determinista promueve a pedido una consulta del LLM que contenga una expresión de pedido. La única pregunta que hoy recibe respuesta en vez de borrador es la de precio sin cantidad ni expresión de pedido —«¿tenés entrecot?»—, y no se pierde en silencio: el cliente recibe una invitación a pedir y el mensaje queda en la conversación.

---

## 6. Tickets de trabajo

Tres tickets sobre **`US-10` · Confirmar el pedido descontando las existencias**, la historia más representativa del flujo E2E: es el **nudo**, el único punto donde el pedido deja de ser una propuesta y produce efectos irreversibles sobre las existencias. Todo lo anterior prepara ese momento y todo lo posterior lo comunica.

Sus tres criterios de aceptación, del Requirement «Confirmación transaccional con descuento de existencias» de `order-confirmation`:

| # | Criterio |
|---|---|
| **C1** | Confirmación correcta *(happy path)* |
| **C2** | Existencias insuficientes en el momento de confirmar *(error)* |
| **C3** | Doble confirmación del mismo pedido *(borde)* |

| Ticket | Tareas de `tasks.md` | Criterios | SP | Depende de |
|---|---|---|:-:|---|
| `CARNIK-DB-01` | 2.1, 2.2 *(parcial)* | C1, C2 | 3 | — |
| `CARNIK-BE-01` | 6.5, 7.2 *(parcial)*, 8.3 *(parcial)* | C1, C2, C3 | 5 | `CARNIK-DB-01` |
| `CARNIK-FE-01` | 6.2 *(parcial)*, 8.4 *(parcial)* | C1, C2 | 3 | `CARNIK-BE-01` |

---

### `CARNIK-DB-01` · Esquema y restricciones que hacen imposible el stock negativo

**Prioridad:** Crítica · **Estimación:** 3 SP · **Etiquetas:** `database`, `prisma`, `mvp`, `flujo-e2e`, `integridad`
**Agrupa:** tarea **2.1** completa y la parte de **2.2** que siembra existencias conocidas
**Satisface:** C1, C2

#### Descripción

**Por qué es necesario.** La confirmación descuenta existencias con un `UPDATE` condicional desde el código. Si ese código tuviera un fallo —o si alguien ejecutara un `UPDATE` a mano contra la base—, `Product.stockQuantity` podría quedar negativo, y el sistema pasaría a prometer carne que no existe. **La base de datos tiene que rechazarlo por sí sola, sin depender de que la aplicación esté bien escrita.**

**Detalle técnico.** Los modelos `Order` y `Product` con los campos que la confirmación escribe, más dos cosas que Prisma no genera solo: una restricción `CHECK` sobre `stockQuantity` y un índice compuesto para la consulta de pendientes. La restricción se añade a mano en el SQL de la migración porque **el DSL de Prisma no soporta `CHECK`**.

#### Fragmento de `prisma/schema.prisma`

```prisma
enum OrderStatus {
  DRAFT
  CONFIRMED
}

enum ProductUnit {
  WEIGHT_KG
  PIECE
}

model Product {
  id                String      @id @default(cuid())
  slug              String      @unique
  name              String
  unit              ProductUnit
  pricePerUnitCents Int
  stockQuantity     Decimal     @default(0) @db.Decimal(10, 3)
  isActive          Boolean     @default(true)
  orderItems        OrderItem[]
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
}

model Order {
  id                String      @id @default(cuid())
  reference         String      @unique
  customerId        String
  conversationId    String
  sourceMessageId   String      @unique
  confirmedByUserId String?
  status            OrderStatus @default(DRAFT)
  draftedBy         DraftOrigin
  totalCents        Int         @default(0)
  confirmedAt       DateTime?
  customer          Customer    @relation(fields: [customerId], references: [id])
  conversation      Conversation @relation(fields: [conversationId], references: [id])
  sourceMessage     Message     @relation(fields: [sourceMessageId], references: [id])
  confirmedBy       User?       @relation(fields: [confirmedByUserId], references: [id])
  items             OrderItem[]
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@index([status, createdAt])
}
```

#### Migración · `prisma/migrations/<timestamp>_init/migration.sql`

Al final del SQL generado por `prisma migrate dev`, añadidas a mano:

```sql
-- Última línea de defensa: ni un fallo de la aplicación ni un UPDATE manual
-- pueden dejar existencias negativas.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_stockQuantity_non_negative"
  CHECK ("stockQuantity" >= 0);

-- Un pedido confirmado debe llevar siempre quién y cuándo; uno en borrador, ninguno.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_confirmed_fields_consistent"
  CHECK (
    ("status" = 'DRAFT'     AND "confirmedAt" IS NULL AND "confirmedByUserId" IS NULL)
    OR
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "confirmedByUserId" IS NOT NULL)
  );
```

#### Criterios de aceptación técnicos

1. `npx prisma migrate deploy` se aplica sin error sobre una base vacía, y `npx prisma migrate status` no reporta desviación.
2. Un `UPDATE "Product" SET "stockQuantity" = -1` ejecutado directamente en SQL **falla** con violación de `Product_stockQuantity_non_negative`.
3. Un `INSERT` de `Order` con `status = 'CONFIRMED'` y `confirmedAt` nulo **falla** con violación de `Order_confirmed_fields_consistent`.
4. `Order.status` toma `DRAFT` por defecto sin indicarlo explícitamente.
5. `EXPLAIN` de la consulta de pendientes (`WHERE status = 'DRAFT' ORDER BY createdAt`) usa el índice `Order_status_createdAt_idx` y no hace recorrido secuencial.
6. `npx prisma db seed` es idempotente: dos ejecuciones seguidas dejan el mismo número de filas.
7. El seed deja al menos un `Product` con `unit = WEIGHT_KG` y `stockQuantity` conocido, para poder aserir el descuento exacto.

#### Archivos

| Ruta | Acción |
|---|---|
| `prisma/schema.prisma` | Crear · modelos, enums e índice compuesto |
| `prisma/migrations/<timestamp>_init/migration.sql` | Crear · generada y luego editada a mano con las dos `CHECK` |
| `prisma/seed.ts` | Crear · catálogo con existencias conocidas |
| `package.json` | Modificar · añadir `prisma.seed` |

#### Definition of Done

- [ ] Migración aplicada en local y en la base efímera de CI sin error.
- [ ] `tests/integration/schema.test.ts` verifica los criterios 2 y 3 esperando que la base **rechace** la escritura ilegal.
- [ ] `npx prisma migrate status` limpio tras el despliegue en Railway.
- [ ] Revisado que ninguna restricción rompe el seed.

---

### `CARNIK-BE-01` · Endpoint de confirmación transaccional e idempotente

**Prioridad:** Crítica · **Estimación:** 5 SP · **Etiquetas:** `backend`, `api`, `transaccional`, `seguridad`, `mvp`, `flujo-e2e`
**Agrupa:** tarea **6.5** completa, la parte de **7.2** que envía el resumen tras confirmar, y la parte de **8.3** de confirmación
**Satisface:** C1, C2, C3
**Depende de:** `CARNIK-DB-01`

#### Descripción

**Por qué es necesario.** Es la operación que convierte una propuesta en un compromiso. Si el cambio de estado y el descuento no ocurren juntos, el sistema puede quedar con un pedido confirmado y existencias intactas —o al revés—, y la carnicería pierde la confianza en el dato del stock, que es la razón por la que el producto existe. Además, dos empleados pueden confirmar a la vez y un doble clic es rutina en una pantalla táctil con guantes.

**Detalle técnico.** `confirmOrder` ejecuta dos `updateMany` condicionales dentro de una transacción de Prisma. El primero, sobre `Order` con `WHERE id = ? AND status = 'DRAFT'`, da la idempotencia gratis: cero filas afectadas significa que ya estaba confirmado. El segundo, por línea, sobre `Product` con `WHERE id = ? AND stockQuantity >= ?`, fusiona comprobación y escritura en una sola operación atómica y elimina la ventana de carrera de un `SELECT` previo. El envío del resumen ocurre **después** del commit.

#### Contrato

- **Ruta y método:** `POST /api/orders/{orderId}/confirm`
- **Autorización:** `requireRole(['EMPLOYEE','ADMIN'])` como **primera línea del handler**, antes de leer el cuerpo y antes de tocar la base. Nunca en middleware.
- **Validación Zod** (`src/lib/validation/orders.ts`):

```ts
export const ConfirmOrderParamsSchema = z.object({
  orderId: z.string().regex(/^c[a-z0-9]{24}$/),
});
```

La operación **no lleva cuerpo**: no necesita parámetros. El guardia optimista que se consideró —enviar el total en pantalla y rechazar si difiere— quedó fuera del MVP y está registrado como riesgo conocido en §2.5.

- **Manejo de errores:**

| Situación | Respuesta | Cuerpo |
|---|---|---|
| Sin sesión o sesión expirada | `401` | `Error` · **antes de consultar la base** |
| `orderId` fuera de patrón | `400` | `ValidationError` con `fields[]` |
| Pedido inexistente | `404` | `Error` |
| Pedido en un estado que no admite confirmación | `409` | `ConfirmConflict` con `code: ORDER_NOT_DRAFT` |
| Alguna línea supera las existencias actuales | `409` | `ConfirmConflict` con `code: INSUFFICIENT_STOCK` y `lines[]` con `requested` y `available` |
| Confirmación correcta | `200` | `OrderConfirmed` con `alreadyConfirmed: false` |
| Segunda confirmación del mismo pedido | `200` | `OrderConfirmed` con `alreadyConfirmed: true`, **sin efectos** |

- **Envío del resumen:** tras el commit, nunca dentro de la transacción. Un fallo se registra como `Message.status = FAILED` y **no revierte la venta**; la respuesta lo refleja en `summaryMessage.status`.

#### Criterios de aceptación técnicos

1. Con existencias suficientes: el `Order` queda en `CONFIRMED`, `Product.stockQuantity` decrementa exactamente la cantidad de la línea, y `confirmedAt` y `confirmedByUserId` quedan escritos en la misma transacción. **(C1)**
2. Con existencias insuficientes: responde `409 INSUFFICIENT_STOCK` con la línea y la cantidad disponible; el `Order` sigue en `DRAFT` y **ningún** `Product` cambia. **(C2)**
3. Dos llamadas seguidas al mismo pedido: la segunda responde `200` con `alreadyConfirmed: true`, `stockQuantity` no vuelve a decrementar, `confirmedAt` no se altera y **no se crea un segundo `Message` de resumen**. **(C3)**
4. Dos llamadas **concurrentes** al mismo pedido: exactamente una descuenta existencias.
5. Sin cookie de sesión: `401`, y con un `orderId` inexistente la respuesta es **idéntica** a la de uno existente.
6. Todas las respuestas validan contra su `components.schemas` de §4.
7. Un fallo forzado del transporte deja el `Order` en `CONFIRMED` con `stockQuantity` descontado y `summaryMessage.status = FAILED`.

#### Archivos

| Ruta | Acción |
|---|---|
| `src/core/orders/confirm.ts` | Crear · `confirmOrder(orderId, userId)` con la transacción |
| `src/app/api/orders/[orderId]/confirm/route.ts` | Crear · handler `POST`: autorización, validación, llamada al núcleo, traducción a HTTP |
| `src/lib/validation/orders.ts` | Modificar · los dos esquemas de arriba |
| `src/core/messaging/outbound.ts` | Modificar · `sendOrderSummary(orderId)`, invocado tras el commit |
| `src/lib/auth/guard.ts` | Reutilizar · sin cambios |

#### Definition of Done

- [ ] `tests/integration/orders.test.ts` cubre los siete criterios, incluido el concurrente con dos transacciones en paralelo.
- [ ] El handler no contiene ningún `if` sobre reglas de negocio: sólo autoriza, valida, delega y traduce.
- [ ] `requireRole` es la primera sentencia ejecutable del handler.
- [ ] Ninguna respuesta incluye `passwordHash` ni `providerMessageId`.
- [ ] `npm run typecheck` y `npm run lint` en verde.

---

### `CARNIK-FE-01` · Acción de confirmar en el detalle, con sus estados

**Prioridad:** Alta · **Estimación:** 3 SP · **Etiquetas:** `frontend`, `react`, `ux`, `mvp`, `flujo-e2e`
**Agrupa:** la parte de **6.2** correspondiente a la acción de confirmar y la de **8.4** que la recorre en el E2E
**Satisface:** C1, C2
**Depende de:** `CARNIK-BE-01`

#### Descripción

**Por qué es necesario.** El empleado atiende de pie, con las manos ocupadas y un cliente enfrente. Un botón que no dice si está trabajando invita al doble clic; un error que no explica **qué línea** falló obliga a leer todo el pedido otra vez. La restricción de las dos interacciones de `US-07` sólo se sostiene si esta acción resuelve el caso normal sin pasos intermedios y el caso de fallo sin obligar a investigar.

**Detalle técnico.** Un componente cliente que deshabilita el control mientras la petición está en vuelo y traduce `409 INSUFFICIENT_STOCK` a un mensaje anclado a la línea concreta, usando `lines[].orderItemId` de la respuesta.

#### Componente y estados

`src/components/ConfirmOrderButton.tsx`, usado desde `src/app/admin/orders/[id]/page.tsx`.

| Estado | Qué se ve | Por qué |
|---|---|---|
| **Inicial** | Botón activo, con el total y el número de líneas | El empleado confirma lo que ve, no una abstracción |
| **Carga** | Botón deshabilitado con indicador; el resto del formulario bloqueado | Impide el doble envío en el cliente. La idempotencia del servidor es la garantía real, no ésta |
| **Error `409 INSUFFICIENT_STOCK`** | Aviso **sobre la línea afectada** con lo pedido y lo disponible, más acceso directo a corregir existencias o ajustar la cantidad | Deja al empleado en el sitio donde puede resolverlo |
| **Error `409 ORDER_NOT_DRAFT`** | «Este pedido ya no admite confirmación», con recarga del detalle | Otra persona lo confirmó entretanto: la solución es mirar de nuevo, no corregir |
| **Error `401`** | Redirección a `/login` conservando el destino | La sesión caducó a media revisión |
| **Error de red o `5xx`** | Mensaje reintentable, sin perder los ajustes en pantalla | Reintentar es seguro: el endpoint es idempotente |
| **Éxito** | Estado confirmado, botón sustituido por el sello con hora y usuario; aviso aparte si `summaryMessage.status` es `FAILED` | El envío al cliente puede fallar sin que la venta lo haga |
| **Vacío** | Un `Order` sin líneas muestra el botón deshabilitado y explica por qué | No debería ocurrir por el invariante `Order ||--|{ OrderItem`, pero la interfaz no asume invariantes |
| **Ya confirmado** | Sin botón; banner de sólo lectura | La edición está prohibida por estado |

#### Validación en cliente

Sólo comodidad: se comprueba que hay al menos una línea y que ninguna está sin resolver antes de habilitar el botón. **Nada de esto es un control**: el servidor revalida todo, y la interfaz nunca decide si la operación es legal.

#### Criterios de aceptación técnicos

1. Desde el listado, un pedido sin ajustes se confirma en **dos interacciones**: abrir el detalle y pulsar confirmar. **(C1)**
2. Durante la petición el botón está deshabilitado y un segundo clic no emite una segunda petición.
3. Ante `409 INSUFFICIENT_STOCK`, el aviso aparece **junto a la línea** cuyo `orderItemId` devuelve la respuesta, con las cantidades pedida y disponible. **(C2)**
4. Ante `401`, redirige a `/login` sin mostrar un error genérico.
5. Tras el éxito, el botón desaparece y se muestran la hora y el usuario de confirmación; si el resumen falló, aparece un aviso independiente que no contradice el éxito de la confirmación.
6. Un `Order` sin líneas muestra el botón deshabilitado con explicación, sin fallo de renderizado.
7. Ningún texto de la interfaz muestra `phoneE164` en esta acción.

#### Archivos

| Ruta | Acción |
|---|---|
| `src/components/ConfirmOrderButton.tsx` | Crear · componente cliente con la máquina de estados |
| `src/components/OrderLineRow.tsx` | Crear · fila de línea que acepta el aviso de existencias |
| `src/app/admin/orders/[id]/page.tsx` | Modificar · componer el detalle y pasar `totalCents` e `items` |

#### Definition of Done

- [ ] `tests/e2e/order-flow.spec.ts` recorre el criterio 1 aserindo el número de interacciones.
- [ ] `tests/unit/confirm-order-button.test.tsx` cubre los estados de carga, `409` con línea señalada, y vacío.
- [ ] Verificado que el doble clic no emite dos peticiones.
- [ ] Sin `dangerouslySetInnerHTML` en ninguno de los componentes nuevos.
- [ ] `npm run typecheck` y `npm run lint` en verde.

---

### Qué queda fuera de estos tres tickets

`US-10` toca también el ajuste de líneas y la corrección de existencias, que llegan por tareas **6.3** y **6.4** y son tickets propios: modifican el borrador pero **no lo hacen avanzar**, así que no pertenecen a la confirmación. Del mismo modo, la parte de **7.2** que envía el acuse automático y el mensaje manual pertenece a `US-11` y `US-12`, no aquí — de la tarea 7.2 sólo entra el resumen posterior al commit.


---

## 7. Pull requests

| PR | Rama | Contenido | Estado |
|---|---|---|---|
| [#1](https://github.com/fedewagner/SRS-Carnik/pull/1) | `feature-entrega1-FJW` | **Entrega 1 · Documentación técnica.** Producto, arquitectura, modelo de datos, API, historias y tickets, derivados de la especificación de `openspec/` | Mergeado |
| [#2](https://github.com/fedewagner/SRS-Carnik/pull/2) | `coderabbit/…` | Propuesta automática de CodeRabbit. **No se incorpora** (ver abajo) | Cerrado sin mergear |
| [#3](https://github.com/fedewagner/SRS-Carnik/pull/3) | `feature-entrega2-FJW` | **Entrega 2 · MVP ejecutable.** Esquema y migración, login, simulador, interpretación con AI y fallback, backoffice y confirmación transaccional, 26 tests, CI y despliegue en Railway. Un commit por historia | Mergeado |
| [#4](https://github.com/fedewagner/SRS-Carnik/pull/4) | `feature-entrega3-FJW` | **Documentación de la entrega.** README con lo verificado, capturas de producción y `prompts.md` de la implementación | Mergeado |
| [#5](https://github.com/fedewagner/SRS-Carnik/pull/5) | `feature-whatsapp-twilio-FJW` | **WhatsApp real vía Twilio** (`US-01`, `US-11`). Webhook con firma validada contra una URL fija, transporte saliente y acuse automático | Mergeado |
| [#6](https://github.com/fedewagner/SRS-Carnik/pull/6) | `feature-us08-FJW` | **Ajuste de líneas** (`US-08`), asignación de producto a menciones sin reconocer y columna de stock disponible | Mergeado |
| [#7](https://github.com/fedewagner/SRS-Carnik/pull/7) | `feature-smart-replies-FJW` | **Respuestas según la intención**: saludo, consulta y «lo de siempre» | Mergeado |
| [#8](https://github.com/fedewagner/SRS-Carnik/pull/8) | `feature-us15-catalog-FJW` | **Catálogo con libro de existencias** (`US-15`). Única migración nueva: `StockMovement` | Mergeado |
| [#9](https://github.com/fedewagner/SRS-Carnik/pull/9) | `feature-us03-rate-limit-FJW` | **Límite de mensajes por remitente** (`US-03`) | Mergeado |
| [#10](https://github.com/fedewagner/SRS-Carnik/pull/10) | `feature-us07-pending-badge-FJW` | **Badge de pendientes con polling** (`US-07`) | Mergeado |
| [#11](https://github.com/fedewagner/SRS-Carnik/pull/11) | `feature-us12-manual-message-FJW` | **Mensaje manual al cliente** desde el detalle (`US-12`) | Mergeado |
| [#12](https://github.com/fedewagner/SRS-Carnik/pull/12) | `feature-us13-dashboard-FJW` | **Pantalla del local** de sólo lectura (`US-13`) | Mergeado |
| [#13](https://github.com/fedewagner/SRS-Carnik/pull/13) | `feature-us14-catalog-answers-FJW` | **Respuestas a consultas de precio y disponibilidad** (`US-14`) | Mergeado |
| [#14](https://github.com/fedewagner/SRS-Carnik/pull/14) | `docs-final-FJW` | Rama de trabajo del cierre; su contenido se entrega íntegro en #15 | Sustituido por #15 |
| [#15](https://github.com/fedewagner/SRS-Carnik/pull/15) | `finalproject-FJW` | **Entrega final.** Rediseño del backoffice, límite de intentos en `/login`, CSP, test del contrato OpenAPI, specs vivas de OpenSpec, configuración del agente (`CLAUDE.md`, subagente revisor, hook, revisión con IA en CI), cinco ADR, capturas regeneradas y suite de 214 tests. Release `v1.0-final-FJW` | Mergeado |

Los PRs #9 a #13 los implementaron cinco agentes en paralelo durante una noche, cada uno en su propio worktree y con su propia base de test, y con prohibición explícita de mergear o desplegar. Se revisaron y mergearon al día siguiente; los conflictos entre ellos —la navegación, las consultas y el E2E, que tocaban varios— se resolvieron conservando ambos lados (ver `prompts.md`).

**Por qué se revirtió una contribución de CodeRabbit.** Un commit del bot (`50b52a8`) entró en `main` con la Entrega 1 y ampliaba el alcance sin una decisión de producto detrás: un outbox con reconciliación de estados, un estado `ASSEMBLED` y un filtro de intención convertido en Must-have, que contradecía el análisis INVEST por el que `US-14` había salido del MVP (§5). Sumaba entre 4 y 6 horas a un plan que ya no tenía margen. Se revirtió en el PR #3, y con él `us-patron.md`, una historia de otro dominio que no pertenecía al proyecto.
