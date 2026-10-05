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
| **Alcance** | Piso de 17 tareas más dos incrementos: WhatsApp real vía Twilio y ajuste de líneas · ver la tabla de abajo |
| **Estado** | Flujo E2E desplegado y funcionando por WhatsApp real. 85 tests y un E2E en verde en CI |

El documento combina dos capas. **§1.3, §1.4, §2.4, §2.6 y §7 describen lo implementado y verificado**; el resto es el diseño de la Entrega 1, derivado de `openspec/changes/bootstrap-carnik/`, que sigue siendo válido para lo que está fuera de esta entrega.

### Alcance entregado frente a especificado

La entrega se adelantó a dos días de trabajo sin código escrito. El plan de 28 tareas (~20 h) no entraba, así que se replanificó a un **piso de 17 tareas (~10 h)** ejecutando el orden de caída pre-comprometido del `proposal.md` hasta el escalón 3. Lo que no está es una decisión registrada en `tasks.md`, no una omisión. Con el piso desplegado, se sumaron dos incrementos, cada uno como change propio de `openspec/`: el canal de WhatsApp real (`add-whatsapp-twilio-channel`) y el ajuste de líneas (`add-order-line-adjustment`).

| Historia | Qué es | Estado |
|---|---|:-:|
| `US-06` | Login con rol y sesión de 8 h | ✅ |
| `US-02` | Simulador de mensajes entrantes | ✅ |
| `US-04a` | Interpretación determinista del pedido | ✅ |
| `US-04b` | Interpretación con AI y caída al determinista | ✅ |
| `US-05` | Valoración en servidor contra catálogo y existencias | ✅ |
| `US-07` | Listado y detalle con la conversación | ✅ · sin badge con polling |
| `US-10` | Confirmación transaccional que descuenta existencias | ✅ |
| `US-11` | Acuse al recibir y resumen al confirmar | ✅ · llegan al WhatsApp del cliente |
| `US-01` | Recibir pedidos por WhatsApp | ✅ · vía **Twilio WhatsApp Sandbox**, no Meta (ver §2.4) |
| `US-08` | Ajustar, eliminar y añadir líneas del borrador | ✅ · más asignación manual de producto a menciones sin reconocer y columna de stock disponible |
| — | Respuestas según la intención: saludo, consulta y «lo de siempre» | ✅ · change `add-conversational-replies` |
| `US-03` | Límite de mensajes por remitente | ⏭ el sandbox sólo admite participantes unidos con código; vuelve a ser necesario con un número propio |
| `US-09` | Corrección de existencias desde la línea | ⏭ |
| `US-12` | Mensaje manual del empleado | ⏭ |
| `US-13` | Cola de armado en `/dashboard` | ⏭ escalón 2 del orden de caída |

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

Sólo lo que entra en el MVP. Cada funcionalidad participa en el flujo de arriba; lo que no participa, no está en esta lista.

#### Must-Have

**1. Conversación bidireccional por WhatsApp**
Recibe los mensajes que el cliente envía al número de la carnicería y devuelve por el mismo chat el acuse de recepción, las aclaraciones que escribe el empleado y el resumen final del pedido. Incluye un **canal de simulación interno** que produce el mismo efecto sin depender de la red del proveedor, y que es lo que permite desarrollar, probar en integración continua y demostrar el producto sin credenciales.
*Por qué es imprescindible:* es el primer paso y el último del flujo. Sin la ida no hay pedido que interpretar, y sin la vuelta el cliente se queda sin saber si su pedido existe — que es exactamente el problema que veníamos a resolver.

**2. Interpretación del pedido con AI**
Convierte el texto libre del cliente en un pedido estructurado, resolviendo cada mención contra el catálogo y marcando las líneas que superan lo disponible; los precios y la disponibilidad los recalcula siempre el servidor, nunca el modelo.
*Por qué es imprescindible:* es el paso que elimina la transcripción manual. Sin él, el empleado recibe un mensaje de texto y volvemos al cuaderno; y sin el anclaje al catálogo y a la cámara, la propuesta sería una promesa que el mostrador no puede sostener.

**3. Backoffice de confirmación**
Muestra el borrador junto a la conversación que lo originó, permite ajustar cantidades y corregir las existencias desde la propia línea, y confirma el pedido descontando el stock en una única transacción — un pedido sin ajustes se cierra en dos toques desde la lista.
*Por qué es imprescindible:* es el control humano que hace que el sistema sea confiable, y el único punto donde el pedido se vuelve real. Sin la confirmación transaccional, dos personas confirmando a la vez dejarían el stock en negativo. Incluye la pantalla del local, que es la misma información filtrada por pedidos ya confirmados.

#### Should-Have

**4. Catálogo conversacional**
Responde automáticamente a preguntas simples sobre el precio o la disponibilidad de un producto, sin generar un pedido y sin inventar datos que no estén en el catálogo.
*Por qué no es imprescindible:* **no participa en el flujo E2E.** Es la única funcionalidad de esta lista que puede caer sin romper nada: si no está, esas preguntas quedan en la conversación y las responde una persona, que es lo que pasa hoy. Se implementa sólo si sobra presupuesto.

### 1.3 Diseño y experiencia de usuario

Recorrido real en producción, capturado en https://srs-carnik-production.up.railway.app con el intérprete de AI activo.

**1 · Acceso.** No hay registro: el personal entra con las cuentas sembradas. Toda pantalla del backoffice redirige aquí sin sesión.

![Login](docs/screenshots/01-login.png)

**2 · El cliente escribe.** El simulador reproduce el mensaje que llegaría por WhatsApp y entra por la misma función de ingesta que usará el webhook. La respuesta muestra el borrador ya valorado: la AI resolvió «un kilo y medio» y «medio de picada», y dejó el cordero —que no está en el catálogo— como mención sin reconocer en vez de inventar un producto.

![Simulador con el borrador resultante](docs/screenshots/02-simulador-borrador.png)

**3 · El empleado revisa.** Una sola pantalla: líneas con el texto original del cliente debajo, precios de la base, aviso cuando una línea supera lo disponible y la conversación al lado. La cabecera indica si el borrador lo propuso la AI o el intérprete por reglas.

![Detalle del borrador](docs/screenshots/03-detalle-borrador.png)

**4 · Confirma.** Un botón. Las existencias se descuentan en la misma transacción y el resumen al cliente queda registrado en la conversación. Si alguna línea supera el stock en el momento de confirmar, la respuesta es un `409` que señala la línea y no se modifica nada.

![Pedido confirmado con el resumen al cliente](docs/screenshots/04-detalle-confirmado.png)

**5 · Listado.** Pendientes primero, con el contador de borradores por confirmar.

![Listado de pedidos](docs/screenshots/05-listado.png)

**6 · Corrección antes de confirmar (`US-08`).** En borrador, cada cantidad se edita en su línea y cada línea se puede eliminar; abajo se añaden productos del catálogo. A una mención que la AI no reconoció —aquí «2 kg de cordero», que no está en el catálogo— se le asigna un producto con el desplegable, conservando el texto original. La columna **Stock disponible** muestra las existencias actuales, que ya descuentan los pedidos confirmados, y se marca en rojo cuando la línea las supera.

![Línea sin reconocer y stock disponible](docs/screenshots/06-linea-sin-reconocer.png)

#### Qué responde el chat

La AI clasifica cada mensaje en la misma llamada que interpreta el pedido; el texto que recibe el cliente sale siempre de plantillas con datos de la base, nunca redactado por el modelo.

| El cliente escribe | Responde Carnik | ¿Crea pedido? |
|---|---|:-:|
| «Hola, quiero hacer un pedido» | «¡Hola Anna! ¿Qué te preparamos hoy?» con un ejemplo. Si ya compró antes: «¿Lo de siempre? 2 kg Entrecot y 6 u. Salchicha Lyoner. Respondé «sí» y lo anotamos» | No |
| «Sí» después de esa sugerencia, o «lo de siempre» | Repite el último pedido confirmado **a precios y stock de hoy** y lo enumera | Sí |
| «2 kg de entrecot y 2 kg de cordero» | «Anotamos: 2 kg Entrecot. Revisamos a mano: «2 kg de cordero»» — sin precios | Sí |
| «¿Abren el sábado?» | «Una persona del equipo te responde en breve» | No |

**Ante la duda, pedido:** si el mensaje menciona un producto, se abre un borrador aunque la AI lo haya clasificado como saludo. Así una mala clasificación nunca pierde una venta en silencio, que fue el motivo por el que la `US-14` había salido del MVP.

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

El fichero de ejemplo se llama `env.example`, sin punto inicial: el hook de pre-commit del repositorio rechaza cualquier `.env*` para que un secreto no pueda llegar a un commit por descuido.

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
        BO["Navegador del empleado<br/>backoffice"]
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
        META{{"Meta<br/>WhatsApp Cloud API"}}
        AI{{"Anthropic<br/>Claude API"}}
    end

    WA -->|"HTTPS · webhook firmado HMAC"| RH
    BO -->|"HTTPS · cookie de sesión"| UI
    KIOSK -->|"HTTPS · cookie de sesión"| UI
    RH -->|"llamada en proceso"| CORE
    UI -->|"llamada en proceso"| CORE
    CORE -->|"SQL sobre TCP/TLS"| DB
    CORE -->|"HTTPS REST · token System User"| META
    CORE -->|"HTTPS REST · API key"| AI
    META -->|"HTTPS"| WA

    classDef externo fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef almacen fill:#dcfce7,stroke:#15803d,color:#14532d
    class META,AI externo
    class DB almacen
```

Rectángulos para servicios, cilindro para la base de datos, hexágonos para servicios externos. **Las dos flechas etiquetadas «llamada en proceso» son la decisión arquitectónica entera**: ahí no hay red, ni serialización, ni un fallo parcial posible. Todo lo demás son fronteras reales con su protocolo.

#### Qué patrón sigue

**Monolito modular desplegado como una sola unidad**, con **puertos y adaptadores en exactamente dos fronteras** — la entrada de mensajes y el intérprete de pedidos — y en ninguna más. No es hexagonal por convicción: es hexagonal donde hay dos implementaciones reales que intercambiar (Meta frente a simulador, LLM frente a determinista) y monolito plano donde no las hay.

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
| Cambio de proveedor barato | La frontera de adaptadores acota el cambio de Meta a otro canal en ~1 h |
| Superficie de ataque mínima | Un solo servicio expuesto, dos endpoints públicos, sin red interna que proteger |

#### Qué sacrifica

Elegir esto cuesta cosas, y son estas:

1. **Escalado acoplado.** No se puede escalar la ingesta sin escalar también el backoffice y la pantalla del local. Una campaña que multiplique los mensajes obliga a sobredimensionar todo el proceso.
2. **Sin aislamiento de fallos.** No hay mamparos: un bucle infinito o una fuga de memoria en cualquier parte tumba el webhook, el backoffice y el dashboard a la vez. En una arquitectura con servicios separados, el mostrador seguiría funcionando aunque la ingesta cayera.
3. **La latencia del LLM está en el camino crítico del webhook.** La llamada a Anthropic ocurre dentro de la petición que Meta espera. Se mitiga con un timeout de 8 s y el respaldo determinista, pero **es una mitigación, no una solución**: la solución sería responder 200 al instante y redactar en background, y eso exige trabajo asíncrono que este diseño no tiene.
4. **El envío saliente no se reintenta.** Sin cola no hay reintento automático: un fallo de red queda registrado como `FAILED` y visible para el empleado, que decide si reenvía a mano. El cliente puede quedarse sin su resumen aunque el pedido esté confirmado.
5. **Sin caché.** Cada carga del listado y cada sondeo del indicador van a la base. A este volumen es irrelevante, pero significa que el suelo de latencia lo pone PostgreSQL.
6. **Despliegue todo o nada.** No se puede publicar un arreglo del dashboard sin volver a desplegar el webhook. Cada despliegue arriesga la ingesta.
7. **Acoplamiento a Railway y a Prisma.** Migrar a otro proveedor implica rehacer el pipeline y la gestión de migraciones. Es deuda aceptada a cambio de no gastar horas en abstraerse de una plataforma que quizá nunca se cambie.

Los sacrificios 3 y 4 son los únicos que tocan al usuario final. Los demás son problemas de un producto con tráfico, y este todavía no lo tiene.

### 2.2 Descripción de componentes principales

| Componente | Responsabilidad | Tecnología | Por qué existe por separado |
|---|---|---|---|
| **Route handlers** (`src/app/api/`) | Traducir HTTP a dominio: verificar firma, parsear, validar y delegar | Next.js Route Handlers | Son los únicos que conocen HTTP y el formato de Meta. Fusionarlos con el núcleo obligaría a construir peticiones falsas para probar reglas de negocio |
| **Server Components y server actions** (`src/app/`) | Renderizar el backoffice y recibir las acciones del empleado | React Server Components | Separados del núcleo por la misma razón: probar el cálculo de un total no debería requerir renderizar un árbol de React |
| **Núcleo de dominio** (`src/core/`) | Ingesta, redacción, valoración, confirmación, existencias | TypeScript puro más Prisma Client | **No importa nada de Next.js ni de Meta.** Es lo que permite que la mayoría de los tests corran sin levantar la aplicación |
| **`OrderDrafter`** (`src/core/drafting/`) | Convertir texto libre en líneas de pedido | Interfaz con dos implementaciones: `@anthropic-ai/sdk` y un parser por reglas | Separado como puerto porque hay **dos implementaciones reales**: la de reglas hace la suite determinista y sostiene el sistema si el proveedor falla |
| **Transporte de WhatsApp** (`src/lib/whatsapp/`) | Firmar, parsear y enviar mensajes | `fetch` sobre Cloud API, con modo `log` | Mismo motivo: el modo de sólo registro es lo que permite que el E2E verifique el envío sin llamar a Meta |
| **Guardia de autorización** (`src/lib/auth/guard.ts`) | Comprobar sesión y rol dentro de cada operación | Cookie firmada | Aparte y explícito para que la comprobación sea **una línea visible al principio de cada handler**. Escondida en middleware, se convierte en la clase de bypass que documenta `design.md` |
| **Esquemas de validación** (`src/lib/validation/`) | Validar en servidor toda entrada de usuario | Zod | Centralizados para que la respuesta a «¿dónde se valida esto?» sea un fichero y no una búsqueda |
| **Cliente Prisma** (`src/lib/db.ts`) | Instancia única de conexión | Prisma Client | Un solo punto evita agotar el pool con recargas en caliente durante el desarrollo |

### 2.3 Estructura de ficheros

Árbol real del repositorio. Los ficheros del diseño que quedaron fuera de esta entrega no se crearon: van al final, marcados ⏭, para que el diseño de §2.2 siga siendo legible.

```
SRS-Carnik/
├── .github/workflows/ci.yml           # auditoría, lint, typecheck, unit + integración, build, E2E
├── openspec/changes/                  # bootstrap-carnik (17 tareas del piso), add-whatsapp-twilio-channel, add-order-line-adjustment
├── prisma/
│   ├── schema.prisma                  # las 7 entidades de §3
│   ├── migrations/…_init/migration.sql # incluye los dos CHECK añadidos a mano
│   └── seed.ts                        # idempotente: 8 productos, 2 usuarios
├── src/
│   ├── app/                           # ADAPTADORES DE ENTRADA — conocen HTTP
│   │   ├── layout.tsx · page.tsx      # / redirige según sesión
│   │   ├── login/{page.tsx,actions.ts}
│   │   ├── (staff)/                   # grupo de rutas con requireRole en el layout
│   │   │   ├── layout.tsx
│   │   │   ├── admin/orders/page.tsx            # listado
│   │   │   ├── admin/orders/[id]/page.tsx       # detalle + conversación
│   │   │   ├── admin/orders/[id]/actions.ts     # server actions de edición de líneas
│   │   │   └── simulator/page.tsx
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── simulator/messages/route.ts
│   │       ├── webhooks/twilio/route.ts         # WhatsApp entrante, con firma
│   │       └── orders/[orderId]/confirm/route.ts
│   ├── core/                          # LÓGICA DE NEGOCIO — no importa Next.js
│   │   ├── messaging/{types,ingest,outbound}.ts
│   │   ├── drafting/{types,schema,aliases,rules,llm,index}.ts
│   │   └── orders/{pricing,createDraft,editLines,confirm,queries}.ts
│   ├── lib/                           # infraestructura
│   │   ├── db.ts · http.ts
│   │   ├── auth/{session,guard}.ts
│   │   ├── twilio/{config,parse,send}.ts         # único módulo que conoce a Twilio
│   │   └── validation/{messaging,orders}.ts
│   └── components/{ConfirmOrderButton,OrderLineRow,AddLineForm,SimulatorForm,StatusBadge}.tsx
├── tests/
│   ├── unit/ · integration/ · e2e/order-flow.spec.ts
│   ├── env.ts · test.env              # variables de test, sin secretos
│   └── global-setup.ts                # migraciones sobre la base de test
├── docs/screenshots/                  # capturas de §1.3, tomadas en producción
├── env.example                        # variables de esta entrega, sin valores
├── railway.json · next.config.ts · vitest.config.ts · playwright.config.ts
└── readme.md · prompts.md

⏭ Fuera de esta entrega: api/orders/pending-count, dashboard/, core/messaging/rateLimit.ts,
  core/stock/adjust.ts, PendingBadge.tsx, SECURITY.md
  Sustituidos por Twilio: api/webhooks/whatsapp → api/webhooks/twilio, lib/whatsapp/* → lib/twilio/*
```

#### Propósito de cada carpeta y a qué patrón obedece

| Carpeta | Propósito | Patrón |
|---|---|---|
| `src/app/` | Todo lo que habla HTTP o renderiza: rutas, páginas, server actions | **Adaptadores de entrada** de puertos y adaptadores. Es la única capa que conoce Next.js |
| `src/core/` | Las reglas del negocio: qué es un pedido válido, cómo se valora, cuándo se puede confirmar | **Dominio.** No importa nada de `next/*` ni del formato de Meta |
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
    APP -->|"HTTPS"| URL["URL pública<br/>destino del webhook de Meta"]

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
            VARS["Variables de entorno<br/>10 claves · sólo aquí"]
        end
        DB[("PostgreSQL 16<br/>servicio gestionado")]
    end

    subgraph fuera["Fuera de Railway"]
        GH["GitHub · rama main"]
        META{{"Meta<br/>WhatsApp Cloud API"}}
        AI{{"Anthropic<br/>Claude API"}}
        USR["Navegador y<br/>pantalla del local"]
    end

    GH -->|"integración de despliegue"| START
    START -->|"SQL DDL · migraciones"| DB
    START -->|"si sale 0, cede el proceso"| APP
    VARS -.->|"inyectadas en el proceso"| APP
    VARS -.->|"DATABASE_URL"| START
    DB -->|"SQL sobre TCP/TLS"| APP
    APP -->|"HTTPS REST saliente"| META
    APP -->|"HTTPS REST saliente"| AI
    META -->|"HTTPS · webhook entrante"| APP
    USR -->|"HTTPS"| APP

    classDef externo fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef almacen fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef secreto fill:#ede9fe,stroke:#6d28d9,color:#4c1d95
    class META,AI externo
    class DB almacen
    class VARS secreto
```

Dos servicios en un mismo proyecto de Railway. `DATABASE_URL` la inyecta Railway al enlazar el servicio de PostgreSQL con el web; las otras nueve se cargan a mano una vez. **La base de datos no está expuesta a internet**: sólo la alcanza el servicio web por la red interna del proyecto.

#### Entornos previstos

| Entorno | Dónde | Base de datos | Canal de WhatsApp | Para qué |
|---|---|---|---|---|
| **Local** | Máquina de desarrollo | PostgreSQL local o en Docker | Ninguno — `WHATSAPP_TRANSPORT=log` y simulador | Desarrollo y depuración |
| **CI** | Runner efímero de GitHub Actions | PostgreSQL como servicio del job | Ninguno | Verificación automática en cada push |
| **Producción** | Railway | PostgreSQL gestionado | Número de prueba de Meta | Demo y URL pública |

**No habrá staging, y la razón no es sólo el presupuesto.** El número de prueba de Meta **admite una única URL de webhook**: montar un staging exigiría una segunda aplicación de Meta con su propio número, sus propios destinatarios verificados por OTP y su propio System User. Eso duplica la parte más frágil del proyecto para proteger un sistema sin usuarios reales.

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
| `META_APP_SECRET` | Verificación HMAC del webhook | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | ✅ | ⬜ *(valor de prueba fijo)* | ✅ |
| `META_VERIFY_TOKEN` | Handshake de alta del webhook | `carnik-verify-local-0000` | ✅ | ⬜ | ✅ |
| `WHATSAPP_TOKEN` | Token permanente de System User | `EAAG...FAKE...ZDZD` | ⬜ *(no hace falta con `log`)* | ⬜ | ✅ |
| `WHATSAPP_PHONE_NUMBER_ID` | Número emisor de la app de Meta | `000000000000000` | ⬜ | ⬜ | ✅ |
| `WHATSAPP_TRANSPORT` | `meta` o `log` | `log` | ✅ | ✅ *(`log`)* | ✅ *(`meta`)* |
| `ANTHROPIC_API_KEY` | Proveedor de AI | `sk-ant-api03-FAKE-KEY-DO-NOT-USE` | ⬜ *(no hace falta con `rules`)* | ⬜ | ✅ |
| `ORDER_DRAFTER` | `llm` o `rules` | `rules` | ✅ | ✅ *(`rules`)* | ✅ *(`llm`)* |
| `SIMULATOR_ENABLED` | Habilita el canal de simulación | `true` | ✅ | ✅ *(`true`)* | ✅ *(`true` para la demo)* |

**GitHub Secrets no guarda ni un solo secreto real, y es intencionado.** El pipeline corre con `WHATSAPP_TRANSPORT=log` y `ORDER_DRAFTER=rules`, de modo que **no hace ninguna llamada externa**: los valores que necesita son constantes de prueba que pueden ir en claro en el workflow. Tampoco hace falta un token de despliegue, porque Railway despliega por su propia integración con GitHub y no desde Actions. Consecuencia: **una filtración del repositorio no compromete ninguna credencial de producción.**

Las tres variables marcadas ⬜ en local sólo hacen falta si se quiere probar contra Meta o contra el proveedor de AI de verdad. El desarrollo normal no las necesita.

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
| `META_APP_SECRET` | Panel de aplicaciones de Meta | El webhook rechaza todo hasta actualizar Railway. **Rotarlo en horario de poco tráfico** |
| `WHATSAPP_TOKEN` | Business Manager de Meta, revocando el token del System User | Los mensajes salientes fallan hasta actualizar. Los pedidos se siguen recibiendo |
| `META_VERIFY_TOKEN` | Se cambia en Railway **y** en la configuración del webhook de Meta | Sólo se usa al dar de alta el webhook; sin impacto en marcha |
| `ANTHROPIC_API_KEY` | Consola de Anthropic | El sistema cae al intérprete determinista. **El flujo no se interrumpe** |
| `DATABASE_URL` | Rotación de credenciales del servicio PostgreSQL de Railway | Reinicio del servicio web |

Después de cualquier rotación: revisar los registros de acceso del proveedor afectado en busca de uso no reconocido, y anotar el incidente en `SECURITY.md`. **La única rotación que interrumpe el flujo E2E es la de `META_APP_SECRET`**; la del proveedor de AI, que a primera vista parecería la más grave, es precisamente la más benigna gracias al respaldo determinista.

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
            alt El estado del recurso prohibe la accion
                D-->>H: 0 filas afectadas
                H-->>N: 409 ORDER_NOT_DRAFT
                Note over H,D: Autorizacion por ESTADO, no por pertenencia:<br/>este sistema no tiene modelo de propiedad
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
| `Product` | Ajustar `stockQuantity` | ✅ | ✅ | ❌ |
| `Product` | Crear o borrar | ❌ sembrado | ❌ | ❌ |
| Canal de simulación | Usar | ✅ | ✅ | ❌ |

> Al construir esta matriz apareció una contradicción en `proposal.md`, que listaba el simulador como exclusivo de `ADMIN` mientras el spec `whatsapp-conversation` tiene un escenario con `EMPLOYEE`. **Corregido en `proposal.md`**; la fuente válida es el spec.

**Dónde se comprueba:** `requireRole(['EMPLOYEE','ADMIN'])` en `src/lib/auth/guard.ts`, invocado **como primera línea de cada route handler y de cada server action** que toque datos: `src/app/admin/layout.tsx`, `src/app/admin/orders/[id]/actions.ts`, `src/app/api/orders/[orderId]/confirm/route.ts`, `src/app/api/orders/pending-count/route.ts`, `src/app/api/simulator/messages/route.ts`. **Nunca sólo en el frontend, y no hay middleware donde delegarlo:** los server actions de Next.js son endpoints HTTP públicos aunque el botón esté oculto.

**Cómo se garantiza que un usuario no accede a recursos de otro.** La respuesta honesta es que **aquí no existe «de otro»**: es una sola carnicería, no hay `tenantId` ni columna de propiedad, y cualquier `EMPLOYEE` está autorizado sobre cualquier `Order` porque ése es el comportamiento correcto en un negocio de dos a seis personas (§3). Lo que sí se aplica:

- **Autorización por estado, no por pertenencia.** La comprobación va **dentro de la misma escritura**: `UPDATE ... WHERE id = ? AND status = 'DRAFT'`. Cero filas afectadas significa «prohibido» sin una lectura previa que abriría una ventana de carrera.
- **Identificadores no adivinables.** Las claves primarias son `cuid` de 25 caracteres, no enteros secuenciales. `Order.reference` se deriva de los seis últimos caracteres del propio `cuid` (`K2M4P0`) precisamente para que **tampoco** sea enumerable: un correlativo diario tipo `2026-08-01-003` sería legible pero permitiría recorrer el catálogo de pedidos probando números. Aun así, **la API no acepta nunca la referencia como parámetro de ruta**: `POST /api/orders/{orderId}/confirm` valida contra `^c[a-z0-9]{24}$`.

#### 3 · Validación de entrada

Todo dato que entra pasa por un esquema Zod en `src/lib/validation/`, **también cuando ya se validó en el navegador**. Lo del cliente es comodidad; lo del servidor es el control.

| Punto de entrada | Qué se valida | Límite |
|---|---|---|
| `POST /api/webhooks/whatsapp` | Estructura del payload de Meta, tipo de mensaje, formato del remitente. **Después de verificar la firma**, nunca antes | 1 MiB |
| `POST /api/simulator/messages` | Número de cliente y texto, tras `requireRole` y `SIMULATOR_ENABLED` | 32 KiB |
| `POST /api/orders/{orderId}/confirm` | `orderId` contra el patrón `cuid`. Sin cuerpo | — |
| `src/app/login/actions.ts` | Email y contraseña | 32 KiB |
| `src/app/admin/orders/[id]/actions.ts` | Cantidad > 0, `productId` existente y activo, longitud del mensaje manual | 32 KiB |
| `src/core/stock/adjust.ts` | Cantidad ≥ 0 y **entera si `Product.unit` es `PIECE`** | — |
| `src/core/drafting/llm.ts` | **La salida del modelo contra `DraftSchema`** antes de persistir nada | — |

Esa última fila es la menos obvia y la más importante: **la respuesta de un proveedor de AI es entrada no confiable exactamente igual que la de un usuario.** Si no valida, se descarta entera y entra el intérprete determinista.

**Subida de archivos: no existe ningún endpoint de subida.** Los adjuntos de WhatsApp —el único vector plausible— **se rechazan en la frontera sin descargar los bytes**: si el evento entrante no es de tipo texto, el sistema responde al cliente pidiendo texto y no llama a la CDN de Meta. Por eso la regla de «no te fíes de la extensión ni del `Content-Type`» no llega a aplicarse: **ambos son metadatos que envía quien sube el fichero, y el único modo de saber qué es un fichero de verdad es inspeccionar sus bytes**. Al no descargarlos, la clase entera de vulnerabilidades desaparece en vez de mitigarse.

#### 4 · Protección de datos

**Qué se guarda y por qué es necesario:**

| Dato | Por qué no se puede prescindir |
|---|---|
| `Customer.phoneE164` | Es a la vez la identidad del cliente y la dirección de entrega de la respuesta. Sin él no hay canal |
| `Customer.profileName` | Única etiqueta legible para el mostrador y para la pantalla del local |
| `Message.body` | Es el pedido. Y el historial es lo que permite al empleado entender una aclaración |
| `Order`, `OrderItem` | El registro comercial de la venta |

**Qué se decidió no guardar:** email del cliente, dirección postal (no hay reparto), datos de pago (fuera de alcance), adjuntos (rechazados), ubicación, e identificadores del cliente enviados al proveedor de AI — al modelo sólo van el texto y el catálogo (`src/core/drafting/llm.ts`).

**Campos que nunca salen en una respuesta:** `User.passwordHash` en ningún caso y `Message.providerMessageId` nunca — **ninguno de los tres endpoints de §4 los devuelve, ni ningún otro campo personal**. `Customer.phoneE164` y `Message.body` sólo se muestran en el **detalle del backoffice**, que es una página renderizada en servidor bajo sesión válida y no una respuesta de API. En `/dashboard` están **prohibidos**, y se excluyen proyectando la consulta sin ellos, no filtrando después.

**Cifrado en tránsito:** HTTPS de extremo a extremo — navegador a Railway, Railway a PostgreSQL sobre TLS, y salientes a Meta y Anthropic sobre HTTPS. **En reposo:** el volumen del PostgreSQL gestionado de Railway está cifrado por el proveedor. **No hay cifrado a nivel de campo**: quien obtenga un volcado de la base lee teléfonos y conversaciones en claro. Es un hueco real y está en la tabla de riesgos.

**Borrado y anonimizado: no implementados.** No hay ventana de retención, ni purga automática, ni endpoint de derecho de supresión. Bajo la nLPD suiza harían falta los tres. Queda declarado en `SECURITY.md` como deuda consciente, y marcado **PREVISTA** abajo.

#### 5 · Vulnerabilidades comunes

**Inyección SQL.** Prisma parametriza todas las consultas del *query builder*, que es lo único que usa el proyecto. **Dónde seguiría habiendo riesgo:** `$queryRaw` y `$executeRaw` con interpolación de cadenas. Regla del proyecto: **prohibidos**, y si alguna vez hicieran falta, sólo con `Prisma.sql` como plantilla etiquetada. Hoy no aparecen en ningún fichero, ni siquiera en el conteo del límite por cliente (`src/core/messaging/rateLimit.ts`), que usa el builder.

**XSS.** React escapa por defecto todo lo que se interpola en JSX. **Qué lo rompería:** `dangerouslySetInnerHTML`. Y aquí es donde tienta, porque hay **dos campos completamente controlados por el atacante** que se pintan en `/admin/orders/[id]`: `Message.body` y `OrderItem.rawText`, ambos texto libre escrito por quien manda el WhatsApp. Regla: **`dangerouslySetInnerHTML` está prohibido en el proyecto**, sin excepción de formato.

**CSRF.** La cookie es `sameSite=lax`, lo que bloquea los POST desde otro sitio, y los Server Actions de Next.js verifican origen por su cuenta. `sameSite=lax` sí permite la navegación GET de nivel superior, lo cual es seguro aquí porque **ninguna operación GET muta estado**. El webhook queda al margen del problema: no se autentica por cookie, así que un ataque CSRF contra él no tendría nada que robar — su control es la firma HMAC.

**Rate limiting.** Implementado **por cliente en la ingesta** (`src/core/messaging/rateLimit.ts`), contando `Message` de la conversación en una ventana antes de invocar al proveedor de AI. **Lo que no está: `/login` no tiene límite de intentos.** Con dos cuentas y contraseñas fuertes sembradas el riesgo es menor, pero es un hueco real y va marcado **PREVISTA**.

**Cabeceras de seguridad.** En `next.config.ts`: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `X-Frame-Options: DENY`. **Una CSP estricta con nonce por petición no entra en el MVP** — con App Router exige integrarse con el middleware y ajustar el `script-src` de Next.js, y es más trabajo del que parece. Marcada **parcial**.

**Dependencias.** `npm audit --audit-level=high` como paso del workflow en `.github/workflows/ci.yml`, de modo que una vulnerabilidad alta o crítica pone el pipeline rojo. Sin Dependabot ni escáner externo: el proyecto tiene semanas de vida, no años.

#### 6 · Gestión de secretos

Ver **§2.4 · Gestión de secretos**, que contiene la tabla completa de las diez variables, dónde vive cada una, el contenido de `env.example` y la política de rotación ante filtración.

**Confirmación:** ningún secreto está en el código. Todos se leen de variables de entorno; `.env.example` se versiona **sin un solo valor**; `.env` va en `.gitignore` con `!.env.example` exceptuado; y **GitHub Secrets no guarda ninguna credencial real**, porque el pipeline corre con `WHATSAPP_TRANSPORT=log` y `ORDER_DRAFTER=rules` y no hace llamadas externas. Una filtración del repositorio no compromete nada de producción.

#### Tabla de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Estado |
|---|:-:|:-:|---|---|
| Prompt injection con consecuencias de negocio | Alta | Medio | Contrato del modelo sin campos de precio ni stock; recálculo en servidor; confirmación humana | **Implementada** |
| Webhook falsificado creando pedidos | Media | Alto | HMAC-SHA256 sobre el cuerpo crudo, comparación en tiempo constante | **Implementada** |
| Pedido duplicado por reintento del proveedor | Alta | Medio | Índices únicos en `Message.providerMessageId` y `Order.sourceMessageId` | **Implementada** |
| Existencias negativas por confirmación concurrente | Media | Alto | `UPDATE` condicional dentro de una transacción | **Implementada** |
| Bypass de autorización vía server action | Media | Alto | `requireRole` dentro de cada handler, nunca sólo en middleware | **Implementada** |
| Simulador accesible en producción | Baja | Alto | `requireRole` **más** `SIMULATOR_ENABLED`; cubierto por el E2E | **Implementada** |
| Coste de AI disparado por abuso | Media | Medio | Límite por `Customer` evaluado antes de invocar al proveedor | **Implementada** |
| XSS vía `Message.body` o `OrderItem.rawText` | Baja | Alto | Escape por defecto de React; `dangerouslySetInnerHTML` prohibido | **Implementada** |
| Inyección SQL | Muy baja | Alto | Query builder de Prisma; `$queryRaw` prohibido | **Implementada** |
| Dependencia con vulnerabilidad conocida | Media | Medio | `npm audit --audit-level=high` en CI | **Implementada** |
| **Fuerza bruta contra `/login`** | Media | Alto | Ninguna hoy. Haría falta límite por IP y por cuenta, con retardo progresivo | **PREVISTA — fuera del MVP** |
| **Sesión robada sin poder revocarla** | Baja | Alto | TTL de 8 h y rotación de `SESSION_SECRET`. No hay revocación individual | **Parcial** |
| **Volcado de base expone teléfonos y conversaciones** | Baja | Alto | Cifrado de volumen del proveedor. **Sin cifrado por campo** | **PREVISTA** |
| **Sin retención, purga ni derecho de supresión (nLPD)** | Alta | Medio | Ninguna. Requiere ventana de retención, purga y endpoint de borrado | **PREVISTA — deuda declarada** |
| **CSP estricta con nonce** | Media | Bajo | Cabeceras base sí; CSP completa no entra en el MVP | **Parcial** |
| **Sin DPA con Meta ni con el proveedor de AI** | Alta | Medio | Ninguna. Es requisito de la nLPD para transferencia internacional | **PREVISTA — deuda declarada** |
| **Dos empleados confirman un total distinto del que revisaron** | Baja | Bajo | Ninguna. Se consideró un guardia optimista —enviar el total en pantalla y rechazar si difiere— y **se descartó del MVP** por presupuesto. El `409 INSUFFICIENT_STOCK` atrapa el caso peligroso: confirmar más cantidad de la que hay | **PREVISTA — descartada a propósito** |

**Cinco riesgos previstos y dos parciales, sobre dieciséis.** Los cuatro que de verdad quitarían el sueño con clientes reales son los dos de cumplimiento —retención y DPA—, el volcado de base sin cifrado por campo, y la fuerza bruta en el login. Ninguno de los cuatro se resuelve con código del MVP: tres son trabajo legal y de proceso, y el cuarto son dos horas que hoy no existen. Están escritos aquí y en `SECURITY.md` en lugar de dejarlos implícitos.

### 2.6 Tests

#### Suite implementada · 85 tests y un E2E en verde

| Nivel | Fichero | Qué verifica |
|---|---|---|
| Unitario | `tests/unit/pricing.test.ts` (7) | Importe por línea con redondeo half-up (1001 × 0,333 → 333; × 0,500 → 501; × 0,667 → 668), sin errores de coma flotante; cantidades válidas por unidad; formato CHF |
| Unitario | `tests/unit/rules-drafter.test.ts` (7) | El ejemplo canónico de la spec; gramos y «medio kilo»; coma decimal; mención sin resolver que conserva `rawText`; **«el entrecot cuesta 0,10 CHF» no genera línea**; un saludo no genera pedido |
| Integración | `tests/integration/confirm-order.test.ts` (8) | **C1** confirma, descuenta y registra el resumen · **C2** stock insuficiente: `409` con la línea, rollback completo · **C3** dos confirmaciones concurrentes descuentan una sola vez y envían un solo resumen · el `CHECK` rechaza stock negativo por SQL directo · valoración con precios de la base · segundo mensaje con borrador abierto · idempotencia por `providerMessageId` |
| Integración | `tests/integration/authorization.test.ts` (3) | `401` en la confirmación **sin consultar la base** · `401` en el simulador sin crear mensajes · `404` con el simulador apagado |
| Unitario | `tests/unit/twilio-parse.test.ts` (6) | Formulario de Twilio → mensaje del dominio; adjunto marcado sin contenido; remitente sin prefijo o malformado, sin `MessageSid` o texto vacío rechazados |
| Integración | `tests/integration/twilio-webhook.test.ts` (9) | Firma válida → borrador y acuse · firma inválida, ausente o con un parámetro alterado → `403` sin escrituras · **firma hecha para otra URL con `X-Forwarded-*` imitando la configurada → `403`** · sin credenciales → `403` (fallo cerrado) · reintento del mismo `MessageSid` sin duplicados · adjunto sin pedido y con respuesta pidiendo texto · remitente malformado → `400` |
| Integración | `tests/integration/outbound-transport.test.ts` (3) | Transporte `twilio` con el SDK sustituido: envío registrado con el SID del proveedor · fallo de Twilio → `FAILED` sin lanzar · **una conversación del simulador nunca sale a la red** |
| Integración | `tests/integration/edit-lines.test.ts` (10) | Ajuste de cantidad recalcula importe, total y aviso · cantidad cero, negativa o fraccionaria en piezas rechazada · añadir y eliminar recalculan el total · asignar producto a una mención sin reconocer · un pedido confirmado no admite ediciones · la cantidad editada es la que se descuenta · server action sin sesión rechazada |
| Unitario | `tests/unit/intent.test.ts` (17) · `tests/unit/replies.test.ts` (5) | Intención por reglas y afirmaciones breves; plantillas sin precios y sin reenviar un nombre de perfil sospechoso |
| Integración | `tests/integration/conversational-replies.test.ts` (10) | Saludo sin pedido; el saludo no bloquea el pedido siguiente; sugerencia con historial; «sí» tras la sugerencia repite a precios de hoy; «sí» sin sugerencia no crea nada; sin historial; producto inactivo excluido; consulta; instrucción embebida que no llega a la respuesta |
| E2E | `tests/e2e/order-flow.spec.ts` (1) | Login → simulador → borrador valorado → detalle con la conversación y el acuse → **asigna un producto a «1 kg de cordero»** → **ajusta el entrecot a 1,5 kg** → confirmación → existencias descontadas con la cantidad editada y resumen visible |

**Lo que el diseño de abajo preveía y esta suite no cubre**, por estar fuera del alcance entregado: el webhook de Meta (sustituido por el de Twilio, cubierto arriba), badge con polling, corrección de existencias y `/dashboard`. La recepción real por WhatsApp no corre en CI: se verificó con mensajes desde un teléfono. Tampoco hay test del `LlmOrderDrafter` en CI, deliberadamente: la suite corre con `ORDER_DRAFTER=rules`. La AI se verificó a mano contra los mismos cuatro mensajes que el intérprete por reglas, incluido el intento de fijar el precio, y en el recorrido de producción de §1.3.

El resto de esta sección es la estrategia de la Entrega 1, que sigue valiendo como plan para los incrementos pendientes.

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
| `POST /api/webhooks/whatsapp` | **200** con firma válida y `Message` persistido · **403** con firma inválida y **cero escrituras** · **200** en entrega repetida sin duplicar · **200** en evento de estado sin crear `Message` · **400** con cuerpo no conforme · **413** por encima de 1 MiB |
| `POST /api/simulator/messages` | **200** con rol válido, devolviendo el borrador generado · **401** sin sesión · **404** con `SIMULATOR_ENABLED=false`, aun autenticado · **400** con número o texto no conformes |
| `POST /api/orders/{orderId}/confirm` | **200** con descuento de `stockQuantity` · **200** idempotente en la segunda llamada, sin segundo descuento ni segundo resumen · **409 `INSUFFICIENT_STOCK`** con la línea y la cantidad disponible · **409 `ORDER_NOT_DRAFT`** · **401** sin sesión, **sin consultar la base** · **404** inexistente · **400** con `orderId` fuera del patrón `cuid` |
| Server actions del backoffice | Rechazo en servidor al invocarlas **sin sesión**, y al editar líneas de un `Order` en `CONFIRMED` |

Cada respuesta se valida contra el `components.schemas` correspondiente de §4, de modo que una divergencia entre el contrato publicado y la implementación pone la suite roja.

**Base de datos de test:** una base dedicada, `prisma migrate deploy` antes de la suite y truncado de tablas entre casos —más rápido que recrear el esquema—. En CI es un servicio `postgres` del propio job.

#### Test E2E · un único recorrido

Un solo test, en `tests/e2e/order-flow.spec.ts`, que recorre el flujo principal completo:

> Un cliente escribe su pedido en lenguaje natural al WhatsApp de la carnicería, el sistema ingiere el mensaje, lo interpreta contra el catálogo y el stock vigente y genera una propuesta de pedido en borrador con los precios recalculados en el servidor, notifica al empleado en el backoffice, que revisa las líneas, ajusta cantidades y —si hace falta— responde al cliente por el mismo chat antes de confirmar, momento en el que el pedido pasa a confirmado, el stock se descuenta en la misma transacción, el cliente recibe el resumen por WhatsApp y el pedido aparece en la pantalla del local para su armado.

Corre **contra el simulador**, no contra Meta: sin red externa, sin credenciales y sin no determinismo. Y **con `ORDER_DRAFTER=rules`**, para que el resultado sea el mismo en cada ejecución.

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

Las doce historias restantes de §5 no tienen ficha completa y por tanto no aparecen aquí, pero sus escenarios están en los specs de `openspec/changes/bootstrap-carnik/specs/` y son igualmente la fuente de sus tests.

---

## 3. Modelo de datos

Siete entidades. Cada una existe porque al menos una historia de §5 la necesita; no hay ninguna previsora. Los nombres coinciden exactamente con los de §1.2 y §5.

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
```

**Relación N:M resuelta.** `Order` y `Product` son N:M en el dominio —un pedido lleva varios productos, un producto aparece en varios pedidos— y se resuelve con `OrderItem` como entidad asociativa. `OrderItem` no es una tabla puente pura: lleva atributos propios (`quantity`, `unitPriceCents`, `lineTotalCents`, `rawText`, `hasStockWarning`), que es precisamente lo que obliga a modelarla como entidad y no como relación implícita.

**Fuera del diagrama, a propósito.** Cada tabla lleva `createdAt` y `updatedAt` gestionados por Prisma (`@default(now())` y `@updatedAt`), que se omiten arriba para no ensuciar el ER. **Una excepción importante:** `Message.createdAt` **no es sólo metadato** — es el campo sobre el que `US-03` cuenta los mensajes de la ventana para aplicar el límite por cliente, así que tiene un índice compuesto con `conversationId`. `Order.confirmedAt` y `Conversation.lastInboundAt` sí aparecen en el diagrama porque son datos de negocio, no marcas del sistema. No hay tablas de auditoría ni de log: la trazabilidad de quién confirmó qué vive en `Order.confirmedByUserId` y `Order.confirmedAt`.

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
Catálogo con sus existencias. Se siembra; no hay CRUD en el MVP.

| Atributo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | String | PK, cuid | Identificador |
| `slug` | String | UK, not null | Clave estable para el seed y para los alias del intérprete |
| `name` | String | not null | Nombre visible |
| `unit` | `ProductUnit` | not null | `WEIGHT_KG` o `PIECE`. Determina si admite fracciones |
| `pricePerUnitCents` | Int | not null | Precio vigente por unidad, en céntimos |
| `stockQuantity` | Decimal(10,3) | not null, default 0 | Existencias. **Nunca por debajo de cero** |
| `isActive` | Boolean | not null, default true | Un producto inactivo no se propone, pero los pedidos históricos lo conservan |

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

- Los secretos de integración —`META_APP_SECRET`, `WHATSAPP_TOKEN`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`— viven sólo en variables de entorno (§1.4).
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
| `User` | `US-06` (autenticación), `US-10` (`confirmedByUserId`), `US-11` y `US-12` (`sentByUserId`) |
| `Customer` | `US-01` (alta e identificación), `US-07` (detalle), `US-13` (cola) |
| `Conversation` | `US-01`, `US-07`, `US-11`, `US-12` |
| `Message` | `US-01`, `US-02`, `US-03`, `US-11`, `US-12` |
| `Product` | `US-04a`, `US-04b`, `US-05`, `US-09`, `US-10` |
| `Order` | `US-04a`, `US-04b`, `US-05`, `US-07`, `US-08`, `US-10`, `US-13` |
| `OrderItem` | `US-04a`, `US-04b`, `US-05`, `US-08`, `US-10` |

**Cada escritura de las historias tiene dónde ir.** Recorrido completo: `US-01` escribe `Customer`, `Conversation` y `Message`; `US-02` escribe `Message` con `channel` `SIMULATOR`; `US-03` sólo lee, contando por `conversationId` y `createdAt`; `US-04a`/`US-04b` escriben `Order` y `OrderItem`, incluido `draftedBy`; `US-05` escribe `unitPriceCents`, `lineTotalCents`, `totalCents` y `hasStockWarning`; `US-06` sólo lee `User`; `US-07` sólo lee; `US-08` escribe y borra `OrderItem`; `US-09` escribe `Product.stockQuantity`; `US-10` escribe `Order.status`, `confirmedAt`, `confirmedByUserId` y decrementa `Product.stockQuantity`; `US-11` y `US-12` escriben `Message` con `direction` `OUTBOUND` y su `status`; `US-13` sólo lee.

**Dos huecos que hay que resolver al implementar**, ninguno exige cambiar el esquema:

- **`US-01`, escenario del adjunto:** el spec dice que se deja constancia del mensaje «sin su contenido», pero `Message.body` es `not null`. Se resuelve escribiendo un marcador generado por el sistema en lugar de dejarlo vacío, de modo que un adjunto rechazado sea distinguible de un mensaje vacío. La alternativa —hacer `body` nullable— introduce un estado ambiguo en la tabla más consultada del sistema.
- **`US-13`, nombre en la pantalla del local:** el spec pide «el nombre de pila», pero `Customer.profileName` es el nombre de perfil de WhatsApp, que puede ser un nombre completo o un apodo. Se recorta en la proyección de la consulta, no en la vista.

**Los nombres coinciden con §1 y §5.** Las siete entidades, sus atributos y los siete enums son exactamente los de `design.md`; no se ha introducido ningún término nuevo ni traducido ninguno.

---
## 4. Especificación de la API

Tres endpoints. Son **las tres únicas fronteras HTTP reales del sistema**: dos entradas y el acto irreversible.

> **Por qué el backoffice no aparece aquí.** Las páginas de `/admin` son Server Components que consultan la base a través de `src/core/orders/queries.ts`: entre la interfaz y el dominio hay una llamada de función, no una petición HTTP. Un `GET /api/orders/{orderId}` sólo existiría para que algo externo lo consumiera, y no hay nada externo. La **confirmación** sí es un route handler —única mutación del backoffice que no es server action— porque tiene contrato publicado y porque el test E2E necesita invocarla dos veces en paralelo para verificar la idempotencia. Recogido en `design.md` D6.

### Límites del contrato

| Límite | Valor | Motivo |
|---|---|---|
| Payload del webhook | **1 MiB** | Los eventos de Meta son de pocos KB; el margen absorbe agrupaciones de mensajes |
| Payload del backoffice y del simulador | **32 KiB** | Ninguna operación necesita más; acota la superficie de abuso |
| Subida de archivos | **No existe** | No hay ningún endpoint de subida. Los adjuntos de WhatsApp se rechazan sin descargarse (§1.2), así que no hay límite de fichero porque no hay ficheros |

### Contrato OpenAPI 3.0

```yaml
openapi: 3.0.3
info:
  title: Carnik API
  version: 1.0.0
  description: |
    Las tres fronteras HTTP del sistema: la entrada real de mensajes desde
    Meta, la entrada equivalente del simulador interno, y la confirmación
    del pedido, que es la única operación con efectos irreversibles.

    Ningún esquema de respuesta expone `User.passwordHash` ni
    `Message.providerMessageId`. Ninguna respuesta incluye
    `Customer.phoneE164` ni el contenido de un `Message`.
servers:
  - url: https://carnik.up.railway.app
    description: Producción

security:
  - sessionCookie: []

paths:
  /api/webhooks/whatsapp:
    post:
      operationId: ingestInboundMessage
      summary: Recibe un evento entrante de WhatsApp
      description: |
        Punto de entrada de todos los mensajes de clientes. La petición se
        autoriza por firma HMAC-SHA256 sobre el cuerpo crudo, comparada en
        tiempo constante antes de cualquier parseo.

        Los eventos de estado de entrega y los mensajes con adjunto se
        descartan devolviendo 200: no son errores del emisor, y responder
        con un código de error provocaría reintentos indefinidos del
        proveedor. La idempotencia la garantiza el índice único sobre
        `Message.providerMessageId`.
      security:
        - metaSignature: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MetaWebhookPayload'
      responses:
        '200':
          description: |
            Evento aceptado. Cubre también los casos sin efecto —evento de
            estado, adjunto rechazado, entrega duplicada— para no inducir
            reintentos del proveedor.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/WebhookAck'
        '400':
          description: Firma válida pero cuerpo no conforme al esquema esperado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationError'
        '403':
          description: |
            Firma ausente, inválida, o cuerpo alterado. No se persiste nada
            ni se invoca al proveedor de AI. El cuerpo no detalla el motivo.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '413':
          description: Payload superior a 1 MiB
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/simulator/messages:
    post:
      operationId: simulateInboundMessage
      summary: Inyecta un mensaje entrante sin pasar por el proveedor
      description: |
        Produce exactamente el mismo efecto de dominio que el webhook, pero
        sin red externa ni credenciales. Es el canal que conduce el test E2E
        y el que permite desarrollar y demostrar el producto con el
        proveedor caído.

        Devuelve el borrador generado para que el efecto del mensaje sea
        observable sin abrir el backoffice.

        **Debe poder desaparecer en producción:** exige sesión con rol y
        además puede apagarse con `SIMULATOR_ENABLED`.
      security:
        - sessionCookie: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SimulatedMessageRequest'
      responses:
        '200':
          description: Mensaje ingerido. `order` es nulo si el texto no contenía un pedido reconocible
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SimulatedIngestResult'
        '400':
          description: Número o texto no conformes
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationError'
        '401':
          description: Sin sesión válida
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: |
            Canal deshabilitado por `SIMULATOR_ENABLED=false`. **Se responde
            404 y no 403 aun con sesión válida**: la existencia misma del
            canal es lo que no debe revelarse.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '413':
          description: Payload superior a 32 KiB
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/orders/{orderId}/confirm:
    post:
      operationId: confirmOrder
      summary: Confirma un pedido y descuenta las existencias
      description: |
        Cambia el estado a `CONFIRMED` y descuenta la cantidad de cada línea
        del `stockQuantity` de su producto, en una única transacción. La
        suficiencia de existencias se comprueba en el momento de confirmar,
        no cuando se generó el borrador.

        **Es idempotente:** confirmar dos veces devuelve 200 con el mismo
        pedido, sin descontar de nuevo, sin alterar `confirmedAt` y sin
        enviar un segundo resumen al cliente.

        **Sin cuerpo de petición:** la confirmación no necesita parámetros.
        El guardia optimista que se llegó a considerar quedó fuera del MVP;
        su ausencia está registrada como riesgo conocido en §2.5.

        El resumen al cliente se envía después de que la transacción
        confirme. Un fallo de envío no revierte la venta.
      security:
        - sessionCookie: []
      parameters:
        - $ref: '#/components/parameters/OrderId'
      responses:
        '200':
          description: Pedido confirmado. Se devuelve lo mismo si ya estaba confirmado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderConfirmed'
        '400':
          description: '`orderId` con formato inválido'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationError'
        '401':
          description: |
            Sin sesión válida. Se responde antes de consultar la base, de
            modo que la respuesta no revela si el pedido existe.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: El pedido no existe
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: |
            Caso de negocio. `INSUFFICIENT_STOCK` cuando alguna línea supera
            las existencias actuales; `ORDER_NOT_DRAFT` cuando el pedido está
            en un estado que no admite confirmación. La transacción revierte
            entera: ni el estado ni las existencias cambian.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConfirmConflict'

components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: carnik_session
      description: |
        Cookie de sesión firmada, `httpOnly`, `secure`, `sameSite=lax`, con
        TTL de 8 h y sin renovación deslizante. Transporta el identificador
        de `User` y su rol. La comprobación se ejecuta dentro de cada
        handler; no hay `middleware.ts`. Roles admitidos: `EMPLOYEE` y
        `ADMIN`.
    metaSignature:
      type: apiKey
      in: header
      name: X-Hub-Signature-256
      description: |
        HMAC-SHA256 del cuerpo crudo con `META_APP_SECRET`, comparado en
        tiempo constante. Es el único mecanismo de autorización del webhook,
        que no tiene sesión por necesidad.

  parameters:
    OrderId:
      name: orderId
      in: path
      required: true
      description: Identificador del pedido. **Nunca se acepta `Order.reference`**, que es adivinable
      schema:
        type: string
        pattern: '^c[a-z0-9]{24}$'

  schemas:
    OrderStatus:
      type: string
      enum: [DRAFT, CONFIRMED]
    DraftOrigin:
      type: string
      enum: [AI, FALLBACK]
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
          example: UNAUTHENTICATED
        message:
          type: string
          description: Texto para registro y depuración, no para mostrar al cliente final
          example: Sesión ausente o expirada

    ValidationError:
      type: object
      required: [code, message, fields]
      properties:
        code:
          type: string
          enum: [VALIDATION_ERROR]
        message:
          type: string
        fields:
          type: array
          items:
            type: object
            required: [path, message]
            properties:
              path:
                type: string
                example: phoneE164
              message:
                type: string
                example: Debe estar en formato E.164

    ConfirmConflict:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          enum: [INSUFFICIENT_STOCK, ORDER_NOT_DRAFT]
        message:
          type: string
        lines:
          type: array
          description: Presente sólo con INSUFFICIENT_STOCK
          items:
            type: object
            required: [orderItemId, requested, available]
            properties:
              orderItemId:
                type: string
              productName:
                type: string
              requested:
                type: string
                description: Decimal como cadena para no perder precisión
                example: '2.000'
              available:
                type: string
                example: '1.500'

    ProductRef:
      type: object
      description: Proyección mínima de Product. No expone stockQuantity absoluto
      required: [id, slug, name, unit]
      properties:
        id:
          type: string
        slug:
          type: string
        name:
          type: string
        unit:
          $ref: '#/components/schemas/ProductUnit'

    OrderItemView:
      type: object
      required: [id, rawText, quantity, unitPriceCents, lineTotalCents, hasStockWarning]
      properties:
        id:
          type: string
        product:
          allOf:
            - $ref: '#/components/schemas/ProductRef'
          nullable: true
          description: Vacío si la mención no se resolvió contra el catálogo
        rawText:
          type: string
          description: Texto original del cliente para esta línea
        quantity:
          type: string
          description: Decimal(10,3) serializado como cadena
          example: '1.500'
        unitPriceCents:
          type: integer
          format: int32
        lineTotalCents:
          type: integer
          format: int32
        hasStockWarning:
          type: boolean
        availableQuantity:
          type: string
          nullable: true
          description: Existencias del producto. Sólo presente si hasStockWarning es true

    OrderDraftView:
      type: object
      description: |
        Borrador recién generado. No incluye datos del Customer ni el
        contenido de la Conversation: es la vista que muestra el simulador
      required: [id, reference, status, draftedBy, totalCents, items]
      properties:
        id:
          type: string
        reference:
          type: string
          example: K2M4P0
        status:
          $ref: '#/components/schemas/OrderStatus'
        draftedBy:
          $ref: '#/components/schemas/DraftOrigin'
        totalCents:
          type: integer
          format: int32
        currency:
          type: string
          enum: [CHF]
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/OrderItemView'

    SimulatedMessageRequest:
      type: object
      required: [phoneE164, text]
      properties:
        phoneE164:
          type: string
          pattern: '^\+[1-9]\d{7,14}$'
          description: Número del cliente simulado
          example: '+41791234567'
        text:
          type: string
          minLength: 1
          maxLength: 4096
          description: Cuerpo del mensaje, tal como lo escribiría el cliente

    SimulatedIngestResult:
      type: object
      required: [messageId, order]
      properties:
        messageId:
          type: string
          description: Identificador del Message registrado
        order:
          allOf:
            - $ref: '#/components/schemas/OrderDraftView'
          nullable: true
          description: Vacío si el texto no contenía un pedido reconocible

    OrderConfirmed:
      type: object
      required: [id, reference, status, totalCents, confirmedAt, confirmedByUserId, alreadyConfirmed, summaryMessage]
      properties:
        id:
          type: string
        reference:
          type: string
        status:
          $ref: '#/components/schemas/OrderStatus'
        totalCents:
          type: integer
          format: int32
        confirmedAt:
          type: string
          format: date-time
        confirmedByUserId:
          type: string
        alreadyConfirmed:
          type: boolean
          description: true si la petición fue un reintento y no tuvo efectos
        summaryMessage:
          type: object
          description: Resultado del envío del resumen al cliente
          required: [status]
          properties:
            status:
              $ref: '#/components/schemas/MessageStatus'
            messageId:
              type: string
              nullable: true

    WebhookAck:
      type: object
      required: [received]
      properties:
        received:
          type: integer
          description: Eventos procesados como mensaje
        ignored:
          type: integer
          description: Eventos descartados por ser de estado, adjunto o duplicados

    MetaWebhookPayload:
      type: object
      required: [object, entry]
      properties:
        object:
          type: string
          enum: [whatsapp_business_account]
        entry:
          type: array
          minItems: 1
          items:
            type: object
            required: [id, changes]
            properties:
              id:
                type: string
              changes:
                type: array
                items:
                  type: object
                  required: [field, value]
                  properties:
                    field:
                      type: string
                      enum: [messages]
                    value:
                      $ref: '#/components/schemas/MetaChangeValue'

    MetaChangeValue:
      type: object
      required: [messaging_product]
      properties:
        messaging_product:
          type: string
          enum: [whatsapp]
        contacts:
          type: array
          items:
            type: object
            properties:
              wa_id:
                type: string
              profile:
                type: object
                properties:
                  name:
                    type: string
        messages:
          type: array
          items:
            type: object
            required: [from, id, timestamp, type]
            properties:
              from:
                type: string
                description: Número del remitente. Se normaliza a E.164 al persistir
              id:
                type: string
                description: Se almacena en providerMessageId y nunca se devuelve
              timestamp:
                type: string
              type:
                type: string
                enum: [text, image, audio, video, document, sticker]
              text:
                type: object
                properties:
                  body:
                    type: string
        statuses:
          type: array
          description: Eventos de entrega. Se descartan sin efecto
          items:
            type: object
            properties:
              id:
                type: string
              status:
                type: string
```

### Por qué el mismo código para «no existe» y «no autorizado»

La regla se aplica **donde protege algo**, y en este contrato hay exactamente un sitio donde lo hace: **`POST /api/simulator/messages` responde 404 cuando `SIMULATOR_ENABLED=false`, incluso a un usuario autenticado y con rol válido.** Un 403 confirmaría que el canal existe y que sólo está apagado, y eso es justo lo que no interesa revelar: el simulador es una vía para crear pedidos sin pasar por la verificación de firma.

El segundo sitio es más sutil y va en la dirección del tiempo, no del código: en la confirmación, **el 401 se devuelve antes de consultar la base**, de modo que ni el cuerpo ni la latencia distinguen un `orderId` real de uno inventado.

Donde la regla **no** se aplica es entre usuarios autenticados. Como explica §3, este sistema **no tiene modelo de propiedad**: cualquier `EMPLOYEE` está autorizado sobre cualquier `Order`. Un 404 en lugar de 403 sólo oculta información a quien no debería tenerla; aquí el usuario habría podido ver ese pedido si existiera, así que el 404 genérico no le esconde nada y sí complica depurar. **Aplicar el patrón donde no protege es teatro de seguridad.**

El día que haya más de una carnicería esto cambia: entonces «existe pero es de otro negocio» **debe** responder 404, nunca 403.

### Ejemplos

#### 1 · Ingesta de un mensaje entrante

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "contacts": [{ "wa_id": "41791234567", "profile": { "name": "Marta" } }],
            "messages": [
              {
                "from": "41791234567",
                "id": "wamid.HBgLNDE3OTEyMzQ1NjcVAgASGBQz",
                "timestamp": "1785534000",
                "type": "text",
                "text": { "body": "Para el sábado quiero 2 kg de entrecot y 6 salchichas" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

```json
{ "received": 1, "ignored": 0 }
```

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
    participant W as Meta Cloud API

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

Son los tres únicos puntos donde una petición HTTP atraviesa el límite del sistema: **el mensaje entra desde el proveedor, entra desde el simulador, y la decisión del empleado se ejecuta con efectos irreversibles sobre las existencias.** Todo lo demás del backoffice —leer el detalle, ajustar una línea, corregir el stock, escribir al cliente— ocurre dentro del proceso, como Server Components y server actions, sin frontera HTTP que documentar. Los dos que sí son endpoints y quedaron fuera, `GET /api/orders/pending-count` y la cola de armado, sólo leen: no hacen avanzar el flujo.

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

| ID | Título | Posición en el flujo E2E | MoSCoW | Ficha completa |
|---|---|---|---|:-:|
| `US-06` | Entrar al backoffice con credenciales y rol | Transversal · precondición de todo paso humano | Must | No |
| `US-01` | Recibir los pedidos que llegan por WhatsApp | 1 · Entrada del mensaje | Must | No |
| `US-03` | Limitar lo que un solo remitente puede consumir | 1 · Entrada · guardarraíl de coste | Must | No |
| `US-02` | Simular mensajes entrantes sin depender de WhatsApp | 1 · Entrada · canal alternativo | Must | No |
| `US-04a` | Convertir el texto en un pedido estructurado (determinista) | 2 · Interpretación | Must | No |
| `US-04b` | Interpretar el pedido con IA y respaldo | 2 · Interpretación | Must | **Sí** |
| `US-05` | Valorar el pedido contra el catálogo y las existencias | 3 · Valoración en servidor | Must | No |
| `US-07` | Ver el detalle y confirmar en dos toques | 4 · Notificación y decisión humana | Must | **Sí** |
| `US-08` | Ajustar las líneas de un pedido antes de confirmarlo | 5 · Ajuste | Must | No |
| `US-09` | Corregir las existencias desde la propia línea | 5 · Ajuste | Must | No |
| `US-12` | Responder al cliente desde el detalle del pedido | 6 · Diálogo · opcional en el flujo | Must | No |
| `US-10` | Confirmar el pedido descontando las existencias | 7 · Confirmación · nudo del flujo | Must | No |
| `US-11` | Respuesta al cliente | 8 · Valor entregado al cliente | Must | **Sí** |
| `US-13` | Ver la cola de armado en la pantalla del local | 9 · Armado en el local | Must | No |
| `US-14` | Responder consultas simples de precio y disponibilidad | Fuera del flujo E2E | **Could** | No · fuera del MVP por no ser estimable ni testeable |

### US-14 sale del MVP: pasa a Could-Have

`US-14` era la única Should-Have del backlog. Pasa a **Could-Have y queda fuera del MVP**, y la razón no es de presupuesto sino de su propia evaluación INVEST: **falla la E y falla la T**. Un clasificador de intención con umbral de confianza no tiene criterio de terminación —siempre hay un caso mal clasificado más—, así que cualquier cifra que le pusiéramos sería un presupuesto disfrazado de estimación. Y no es testeable en lo que importa: se puede aserir que no crea `Order`, que registra el `Message` y que calla cuando duda, pero **no existe aserción determinista que compruebe que clasifica bien**.

Eso importa por la asimetría del error. Clasificar una consulta como pedido genera un `Order` en `DRAFT` que alguien descarta en dos segundos. **Clasificar un pedido como consulta pierde una venta en silencio**: nadie se entera, no hay `Order` que revisar, no hay alerta, y el cliente cree que le contestaron. Es un modo de fallo invisible que ningún test del proyecto podría detectar, en un producto cuya premisa entera es que ningún pedido se pierda.

Sin ella, las preguntas simples quedan en la `Conversation` y las responde una persona — exactamente lo que ocurre hoy en la carnicería. El flujo E2E permanece íntegro: ninguna de las catorce historias restantes depende de `US-14`.

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
| #5 | `feature-whatsapp-twilio-FJW` | **WhatsApp real vía Twilio** (`US-01`, `US-11`). Webhook con firma, transporte saliente y acuse automático | Abierto |
| #7 | `feature-smart-replies-FJW` | **Respuestas según la intención** y «lo de siempre» (`add-conversational-replies`) | Abierto |
| #6 | `feature-us08-FJW` | **Ajuste de líneas** (`US-08`), asignación de producto a menciones sin reconocer, columna de stock disponible y este README | Abierto, apilado sobre #5 |

**Por qué se revirtió una contribución de CodeRabbit.** Un commit del bot (`50b52a8`) entró en `main` con la Entrega 1 y ampliaba el alcance sin una decisión de producto detrás: un outbox con reconciliación de estados, un estado `ASSEMBLED` y un filtro de intención convertido en Must-have, que contradecía el análisis INVEST por el que `US-14` había salido del MVP (§5). Sumaba entre 4 y 6 horas a un plan que ya no tenía margen. Se revirtió en el PR #3, y con él `us-patron.md`, una historia de otro dominio que no pertenecía al proyecto.
