# Design — Bootstrap Carnik (MVP)

## Context

Proyecto nuevo, sin código previo. Ver `proposal.md` para la motivación, el alcance, el inventario de datos personales y la matriz de roles.

Tres restricciones dan forma a todo lo que sigue:

1. **~22 h netas de implementación para una persona.** Cada decisión se juzga por lo que cuesta construirla y depurarla, no por lo que costaría mantenerla a tres años. El criterio de rechazo es explícito: si algo añade una entidad, un servicio o una integración que el flujo E2E no necesita, queda fuera.
2. **El webhook es un endpoint público** que cualquiera puede alcanzar, y su contenido llega a un LLM que razona sobre precios y disponibilidad. La superficie de ataque existe desde la primera línea de código.
3. **Datos personales desde el minuto uno.** Números de teléfono y conversaciones bajo la nLPD suiza.

El sistema modela **una** carnicería. No hay multi-tenant, y el diseño lo asume en todas partes.

## Goals / Non-Goals

**Goals:**

- Que el núcleo de dominio no conozca a Meta ni al proveedor de AI, para que ambos sean reemplazables y stubbeables.
- Que la confirmación de un pedido sea atómica e idempotente, incluso con doble clic o dos empleados a la vez.
- Que el test E2E corra sin red externa, sin credenciales y sin no-determinismo.
- Que todo dato de usuario se valide en el servidor, en un punto identificable por escrito.
- Que el número de entidades y de superficies sea el mínimo que sostiene el flujo.

**Non-Goals (a nivel diseño, más allá de lo excluido en el proposal):**

- Escalabilidad horizontal. Una instancia, una base de datos.
- Trabajo en background. Sin colas, sin workers, sin cron.
- Realtime. Sin WebSockets ni SSE.
- Observabilidad más allá de logs estructurados.
- Migraciones reversibles o compatibilidad hacia atrás del esquema. No hay datos que preservar.

## Decisions

### D1 — Monolito Next.js: sin colas, sin workers, sin caché distribuida

Una única aplicación Next.js 15 (App Router) desplegada en Railway, con PostgreSQL gestionado al lado. Todo el trabajo ocurre dentro del ciclo de vida de una request.

*Alternativa considerada:* una cola (BullMQ + Redis) para los envíos salientes y la llamada al LLM. **Rechazada explícitamente.** Requeriría un segundo servicio en Railway, un worker con su propio despliegue y su propio modo de fallo, y duplicaría el trabajo de CI. El volumen real es de decenas de mensajes al día.

*Trade-off:* el webhook de Meta espera respuesta rápida y nuestra ruta llama al LLM de forma síncrona. Se mitiga con timeout duro de 8 s en el drafter y el fallback determinista (D8): la ruta siempre responde. El coste real es que un pedido puede tardar unos segundos en aparecer en el backoffice; irrelevante para el caso de uso.

### D2 — Esquema Prisma: siete entidades, ninguna prescindible

`prisma/schema.prisma`:

| Tabla | Notas |
|---|---|
| `User` | `email` único, `passwordHash`, `role` (`ADMIN` \| `EMPLOYEE`). Sembrado, sin autorregistro. |
| `Product` | `name`, `slug` único, `unit` (`WEIGHT_KG` \| `PIECE`), `pricePerUnitCents`, **`stockQuantity` (Decimal)**, `isActive`. Sembrado. |
| `Customer` | `phoneE164` único, `profileName`. |
| `Conversation` | `customerId` único (una conversación abierta por cliente), `lastInboundAt`. |
| `Message` | `conversationId`, `direction` (`INBOUND` \| `OUTBOUND`), `channel` (`WHATSAPP` \| `SIMULATOR`), `providerMessageId` **único y nullable**, `body`, `status`, `sentByUserId` nullable. |
| `Order` | `reference` (**los seis últimos caracteres del `cuid` en mayúsculas**, p. ej. `K2M4P0`), `customerId`, `conversationId`, `sourceMessageId`, `status` (`DRAFT` \| `CONFIRMED`), `totalCents`, `draftedBy` (`AI` \| `FALLBACK`), `confirmedAt`, `confirmedByUserId`. |
| `OrderItem` | `orderId`, `productId` **nullable**, `rawText`, `quantity` (Decimal), `unitPriceCents`, `lineTotalCents`, `hasStockWarning`. |

**`stockQuantity` es un campo de `Product`, no una tabla `StockItem`.** Es una relación 1-a-1 estricta sin atributos propios, así que separarla solo añadiría una tabla, un join en cada consulta de propuesta y una fila más que crear en el seed. **Se evita** una entidad completa.

**No hay tabla `OrderStatusHistory`, y el enum de estado no tiene `REJECTED`.** Una tabla de historial se justifica cuando hay varias transiciones que auditar; aquí solo existe `DRAFT → CONFIRMED`, así que la tabla tendría exactamente una fila por pedido duplicando `confirmedAt` y `confirmedByUserId`, que ya viven en `Order`. Y `REJECTED` no aparece en ningún Requirement ni escenario: era un valor de enum sin comportamiento detrás. **Se evita** una segunda entidad, una inserción dentro de la transacción de confirmación y una aserción en los tests de integración.

*Trade-off:* se pierde el historial de movimientos de stock y la posibilidad de auditar transiciones futuras sin una migración. Ninguno de los dos está en el flujo E2E ni en ninguna capacidad. El día que exista un estado de rechazo, entra con su Requirement, sus escenarios y su tabla — no antes.

`OrderItem.productId` es nullable a propósito: es lo que permite persistir una línea sin resolver conservando `rawText` en vez de descartarla o inventar un producto.

### D3 — Dinero en enteros, cantidades en Decimal

Importes en `Int` de céntimos de CHF. Cantidades en `Decimal` de Prisma (`@db.Decimal(10,3)`), nunca `Float`.

*Trade-off:* hay que convertir a la entrada y a la salida, y `Decimal` no es un `number` de JS. A cambio, elimina la clase de bugs de coma flotante en precios y en descuento de existencias — inaceptables en un sistema que cobra por peso.

### D4 — Sesión propia con cookie firmada, no Auth.js

Login por email y contraseña contra `User.passwordHash` (**argon2id**, sin alternativa: dos algoritmos admitidos en un sistema con dos cuentas es indecisión, no flexibilidad), sesión en cookie `httpOnly`, `secure`, `sameSite=lax`, firmada con `SESSION_SECRET`, con **TTL de 8 h** —aproximadamente un turno de mostrador— y **sin renovación deslizante**. Dos usuarios sembrados. Sin registro, sin recuperación de contraseña, sin OAuth.

*Alternativa considerada:* Auth.js v5 con Credentials provider. **Rechazada por presupuesto.** Es la opción correcta a largo plazo, pero su configuración en App Router es un sumidero conocido y aporta cero funcionalidad demostrable dado que no hay OAuth ni registro en alcance.

*Trade-off:* criptografía de sesión propia, que es donde uno no quiere improvisar. Se acota usando una librería de sesión establecida (`iron-session` o equivalente) en vez de firmar a mano, y se declara como deuda en `SECURITY.md`.

### D5 — Autorización en cada handler y server action, nunca solo en middleware

Un helper `requireRole(['EMPLOYEE','ADMIN'])` en `src/lib/auth/guard.ts` se invoca **como primera línea de cada route handler y de cada server action** que toque datos. El middleware puede redirigir por UX, pero **no es un control de seguridad**.

Además del rol, las operaciones de escritura comprueban el **estado del recurso** en la misma operación que escribe (ver D10 y la matriz del proposal): un `Order` fuera de `DRAFT` no admite edición, un `Message` enviado es inmutable, y una cantidad debe ser válida para la unidad de su producto.

*Justificación:* la clase de bypass de middleware en Next.js (CVE-2025-29927) es precisamente el fallo de confiar la autorización a esa capa. Los Server Actions son endpoints HTTP públicos aunque el botón esté oculto.

*Nota honesta sobre "autorización sobre un recurso concreto":* en un sistema de un solo inquilino no hay modelo de propiedad — cualquier empleado puede actuar sobre cualquier pedido, porque es la misma carnicería. La autorización por recurso aquí es **por estado**, no por pertenencia. Inventar un modelo de ownership sería complejidad sin valor.

### D6 — Dos adaptadores de entrada, un único núcleo

```
POST /api/webhooks/whatsapp   → adaptador Meta (verifica firma, desanida payload)
GET  /api/webhooks/whatsapp   → handshake hub.challenge / hub.verify_token
POST /api/simulator/messages  → adaptador simulador (requiere sesión + flag de entorno)
                                      ↓ ambos
                        ingestInboundMessage(msg: InboundMessage)
```

`InboundMessage` es un tipo de dominio (`phoneE164`, `profileName`, `text`, `providerMessageId`, `channel`) en `src/core/messaging/`. Nada bajo `src/core/` importa nada de Meta.

Superficie completa de rutas — **seis páginas, cuatro endpoints**, sin una sola de más:

| Ruta | Qué es |
|---|---|
| `/` | Redirección a `/admin/orders` o a `/login`. Sin landing pública. |
| `/login` | Autenticación |
| `/admin/orders` | Listado de pendientes + badge |
| `/admin/orders/[id]` | Detalle, ajuste de líneas y de existencias, mensaje manual, confirmación |
| `/dashboard` | Cola de armado (misma consulta, filtro `CONFIRMED`) |
| `/simulator` | Canal de simulación |
| `GET /api/orders/pending-count` | Polling del badge |
| `POST /api/orders/[orderId]/confirm` | Confirmación transaccional |

**El backoffice no tiene endpoint de lectura, y es deliberado.** Las páginas son Server Components que consultan la base a través de `src/core/orders/queries.ts`: entre la página y el dominio hay una llamada de función, no una frontera HTTP. Un `GET /api/orders/[orderId]` sólo existiría para que algo externo lo consumiera, y no hay nada externo.

La confirmación **sí** es un route handler, no una server action, por dos motivos: es la operación con contrato publicado en el readme, y el test E2E necesita poder invocarla directamente para verificar idempotencia con dos peticiones concurrentes. El resto de las mutaciones del backoffice —ajuste de líneas, corrección de existencias, mensaje manual— siguen siendo server actions, que es donde encajan.

*Trade-off:* una inconsistencia deliberada entre cómo se invoca la confirmación y cómo se invocan las demás mutaciones. Se acepta porque la confirmación es la única con requisitos de concurrencia que probar.

*Trade-off:* una capa de traducción extra frente a parsear el payload de Meta directamente en la lógica. Se paga una vez (~30 min) y compra tres cosas: cambiar de proveedor cuesta una hora, la E2E corre sin red, y los tests de dominio no necesitan fixtures de Meta.

### D7 — Firma HMAC sobre el cuerpo crudo, verificada antes de parsear

> **Revertida por el change `add-whatsapp-twilio-channel` (decisión T1).** El canal real es Twilio WhatsApp Sandbox, no Meta Cloud API: había cuenta de Twilio y no app de Meta, y el sandbox permite a un evaluador probar desde su teléfono. La trampa que motivaba esta decisión —la firma de Twilio sobre la URL pública detrás del proxy— se neutraliza validando contra la variable fija `TWILIO_WEBHOOK_URL` (T2). El texto de abajo se conserva como registro de la decisión original.

En `POST /api/webhooks/whatsapp` se lee `await req.text()` **antes** de cualquier parseo, se calcula HMAC-SHA256 con `META_APP_SECRET` y se compara contra `X-Hub-Signature-256` en tiempo constante. Si no valida: 403 y retorno inmediato, sin tocar la base ni invocar al LLM.

*Justificación de la elección de proveedor:* Meta firma sobre el cuerpo, no sobre la URL. Con Twilio (HMAC-SHA1 sobre la URL exacta) habría que reconstruir la URL pública desde `X-Forwarded-Proto` / `X-Forwarded-Host` porque Railway termina TLS — una hora de depuración que este diseño evita por construcción.

*Trade-off:* en App Router hay que recordar leer el body crudo primero; si algo lo consume antes, la firma no valida nunca.

### D8 — `OrderDrafter` como interfaz con dos implementaciones

```ts
interface OrderDrafter {
  draft(text: string, catalog: CatalogSnapshot): Promise<DraftResult>
}
```

- `LlmOrderDrafter` — SDK oficial `@anthropic-ai/sdk`, modelo `claude-opus-5`, salida estructurada vía `client.messages.parse()` con `output_config: { format: zodOutputFormat(DraftSchema), effort: "low" }`. Timeout de 8 s.
- `RuleBasedOrderDrafter` — parser determinista (cantidad + unidad + alias de producto por regex sobre el catálogo). Sin red.

Selección por `ORDER_DRAFTER=llm|rules`. **Los tests corren siempre la determinista.** Si la implementación LLM lanza, agota el timeout o devuelve algo que no valida contra el esquema, se cae al fallback y el `Order` se marca `draftedBy = FALLBACK`.

*Trade-off:* mantener dos implementaciones del mismo contrato es ~45 min extra. Compra CI determinista, una demo que no depende de la red ni de la cuota del proveedor, y disponibilidad real del flujo cuando el LLM falla.

*Notas de la API que condicionan el código:* en `claude-opus-5` el parámetro `temperature` está **eliminado y devuelve 400** — no se usa. El pensamiento está activo por defecto y **cuenta contra `max_tokens`**, así que se fija `max_tokens: 8000` con `effort: "low"` para una extracción corta. La primera petición con un esquema nuevo paga una compilación que luego se cachea 24 h.

### D9 — La AI propone, el servidor decide

`DraftResult` contiene únicamente `{ productSlug | rawText, quantity, unit }` por línea. **Ni precios ni totales ni disponibilidad.** El servidor los calcula en `src/core/orders/pricing.ts` leyendo `Product.pricePerUnitCents` y `Product.stockQuantity`.

*Justificación:* es simultáneamente el control contra prompt injection con consecuencias de negocio y lo que hace el flujo testeable. Un cliente que escriba "el entrecot cuesta 0,10 CHF" no puede afectar nada, porque ese campo no existe en el contrato de salida del modelo.

### D10 — Confirmación: una transacción, con `updateMany` condicional

`confirmOrder` en `src/core/orders/confirm.ts`, dentro de `prisma.$transaction`:

1. `updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CONFIRMED', ... } })`. Si `count === 0`, el pedido ya no estaba en borrador: se aborta sin error y sin efectos.
2. Por cada línea, `updateMany({ where: { id: productId, stockQuantity: { gte: qty } }, data: { stockQuantity: { decrement: qty } } })`. Si `count === 0`, existencias insuficientes: se lanza y la transacción revierte entera.

Dos pasos, no tres: el paso 1 ya escribe `confirmedAt` y `confirmedByUserId`, así que la trazabilidad de quién confirmó y cuándo no necesita una inserción adicional.

*Justificación:* el `where` condicional hace que comprobación y escritura sean una sola operación atómica en la base. Un `SELECT` previo seguido de `UPDATE` tiene una carrera entre ambos, y con dos empleados confirmando a la vez las existencias pueden quedar negativas. El paso 1 da la idempotencia gratis: la segunda confirmación no encuentra fila que actualizar.

*Trade-off:* el mensaje "existencias insuficientes" pierde detalle, porque el fallo se detecta por `count === 0` y no por una lectura previa. Se recupera releyendo el `Product` en el manejador del error para construir el mensaje al empleado.

### D11 — Corrección de existencias desde la línea del pedido, sin pantalla de catálogo

La única escritura de `Product.stockQuantity` fuera de la confirmación es una server action invocada desde el detalle del pedido, sobre la línea donde el empleado ve la discrepancia.

*Justificación:* es el momento real en que un carnicero descubre que el stock está mal — no hay un ritual separado de "gestión de inventario" en una tienda de seis personas. **Se evita** una ruta `/admin/products`, un CRUD y una capacidad entera.

*Trade-off:* no se pueden dar de alta productos nuevos sin re-sembrar. Supuesto declarado en el proposal: el catálogo de una carnicería cambia poco, y el flujo E2E no lo requiere.

### D12 — Envío saliente síncrono, fuera de la transacción

El resumen al cliente se envía **después** de que la transacción commitee, nunca dentro. Se registra como `Message` saliente con `status` (`SENT` \| `FAILED`).

*Justificación:* una llamada de red dentro de una transacción la mantiene abierta durante segundos y puede dejar el pedido sin confirmar por un fallo del proveedor. Al revés tampoco es aceptable: si el envío falla, el pedido ya está confirmado y las existencias descontadas, que es lo correcto — la venta es real aunque el aviso no llegue.

*Trade-off:* inconsistencia entre nuestro sistema y lo que el cliente sabe. Es la inconsistencia correcta, y está declarada en el spec `whatsapp-conversation`.

### D13 — Notificación por polling, y el dashboard como proyección

`GET /api/orders/pending-count` (autenticada) devuelve el número de pedidos en borrador; un componente cliente lo consulta cada 10 s. Ante fallo conserva el último valor conocido y lo marca desactualizado — nunca muestra cero.

`/dashboard` **reusa la misma función de consulta** que `/admin/orders`, cambiando el filtro de estado a `CONFIRMED` y proyectando menos campos (sin teléfono, sin conversación). No hay consulta nueva ni componente nuevo de datos.

*Alternativa considerada:* SSE o WebSockets. **Rechazada:** no hay infraestructura de realtime en el stack y Railway añadiría fricción. El polling son 30 minutos y cubre el requisito.

### D14 — Rate limit contando filas, sin tabla nueva

El límite por cliente se evalúa con un `count` de `Message` de esa conversación en la última hora, antes de invocar al LLM.

*Trade-off:* una consulta extra por mensaje entrante, frente a un contador dedicado o Redis. A este volumen es trivial, y el ahorro es una tabla y una dependencia menos.

### D15 — Validación en el servidor: esquemas Zod en el borde

Todo dato que entra pasa por un esquema Zod en `src/lib/validation/`. Puntos concretos, sin excepción:

| Entrada | Dónde se valida |
|---|---|
| Payload del webhook de Meta | `src/app/api/webhooks/whatsapp/route.ts`, tras verificar la firma |
| Payload del simulador | `src/app/api/simulator/messages/route.ts`, tras `requireRole` |
| Salida del `LlmOrderDrafter` | `src/core/drafting/llm.ts`, contra `DraftSchema` antes de persistir |
| Edición de líneas de pedido | `src/app/admin/orders/[id]/actions.ts` |
| Corrección de existencias | `src/app/admin/orders/[id]/actions.ts` |
| Confirmación de pedido | `src/app/admin/orders/[id]/actions.ts`, sobre el id |
| Mensaje manual al cliente | `src/app/admin/orders/[id]/actions.ts` |
| Credenciales de login | `src/app/login/actions.ts` |

La validación en el cliente, si existe, es solo UX. Ningún camino confía en ella.

### D16 — Tests: Vitest más Playwright, contra PostgreSQL real

- **Unitarios (Vitest):** cálculo de precios, `RuleBasedOrderDrafter`, verificación de firma HMAC, validación de unidades. Sin base de datos.
- **Integración (Vitest + Postgres):** ingesta con firma válida/inválida/duplicada, confirmación transaccional, descuento de existencias, autorización de server actions. Base efímera, migraciones aplicadas, truncado entre tests.
- **E2E (Playwright), uno solo:** `POST /api/simulator/messages` → aparece `Order` en `DRAFT` → el empleado autenticado ajusta la cantidad y confirma → `CONFIRMED`, `Product.stockQuantity` descontado, `Message` saliente registrado.

`WHATSAPP_TRANSPORT=log` en tests y CI: el transporte saliente escribe a un log en memoria en vez de llamar a Meta.

*Alternativa considerada:* Testcontainers. **Rechazada por presupuesto:** un servicio `postgres` en GitHub Actions más `prisma migrate deploy` es más simple y suficiente.

### D17 — CI/CD y despliegue

GitHub Actions: `install → lint → typecheck → unit + integración (con servicio postgres) → build → e2e`. Railway despliega desde `main` y ejecuta `prisma migrate deploy` en el arranque.

**El esqueleto se despliega con CI en verde antes de escribir lógica de dominio.** No es preferencia de proceso: la URL pública es además el destino del webhook, así que el despliegue está en el camino crítico de la primera integración, no al final.

### D18 — Variables de entorno (ningún secreto en el código)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (Railway la inyecta) |
| `SESSION_SECRET` | Firma de la cookie de sesión |
| `META_APP_SECRET` | Verificación HMAC del webhook. **No es el token de acceso.** |
| `META_VERIFY_TOKEN` | Handshake `GET` de alta del webhook (valor arbitrario elegido por nosotros) |
| `WHATSAPP_TOKEN` | Token permanente de System User para enviar mensajes |
| `WHATSAPP_PHONE_NUMBER_ID` | Número emisor |
| `WHATSAPP_TRANSPORT` | `meta` \| `log` — `log` en tests y CI |
| `ANTHROPIC_API_KEY` | Proveedor de AI |
| `ORDER_DRAFTER` | `llm` \| `rules` |
| `SIMULATOR_ENABLED` | `true` \| `false` — controla si la ruta del simulador existe |

`.env.example` se versiona con estas claves y valores vacíos. `.env` nunca.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| **El token de WhatsApp expira a las 24 h.** El token por defecto del panel de Meta caduca sin aviso y mata la demo sin tocar código. | Crear el System User y generar el token permanente **antes** de empezar. Es alcance obligatorio, no configuración opcional. |
| **La verificación de firma bloquea el desarrollo local.** Sin túnel público, Meta no puede alcanzar el webhook. | El simulador (D6) es el camino de desarrollo por defecto. El webhook real se integra en un bloque acotado de 2 h. |
| **El `OrderDrafter` con LLM es un pozo sin fondo.** Iterar prompts no tiene criterio de terminación. | Contrato de salida fijo desde el principio (D9), timeout duro, fallback determinista, y un límite de 2,5 h. Vencido el límite, se entrega la versión determinista. |
| **La E2E en CI se lleva más tiempo del estimado.** Playwright con servicio Postgres y migraciones es un sumidero clásico. | La E2E vacía corre en verde desde la hora 2 (D17); se le añaden pasos después. Nunca se escribe al final. |
| **Bloqueo del webhook por latencia del LLM.** Meta espera respuesta en un plazo acotado. | Timeout de 8 s más fallback (D8). Si se vuelve un problema real, la salida es responder 200 antes de redactar; no se hace por adelantado porque exigiría trabajo en background (D1). |
| **El simulador abierto en producción.** Sería exactamente el webhook sin autenticar que D7 evita. | Doble control: `requireRole` más `SIMULATOR_ENABLED`. La E2E cubre el caso no autenticado. |
| **Sin CRUD de catálogo, un producto mal sembrado obliga a re-sembrar.** | Consciente. El seed se versiona y `prisma db seed` es idempotente. Aceptable para un MVP de demostración; sería inaceptable con un cliente real. |
| **Deuda de cumplimiento en datos personales.** Retención, DPAs con Meta y el proveedor de AI, transferencia internacional, derecho de borrado. | Fuera de alcance y declarada en `SECURITY.md`. Dentro de alcance: datos de seed sintéticos, sin números completos ni cuerpos de mensaje en logs, y no enviar identificadores del cliente al proveedor de AI (spec `ai-order-intake`). |
| **Un solo idioma de atención.** El dialecto suizo-alemán frente al alemán estándar afecta directamente al drafter. | Supuesto explícito. El fallback determinista se construye sobre alias de producto, que es la parte del problema que sí se puede acotar. |

## Migration Plan

No hay migración: el proyecto arranca desde cero y no existen datos que preservar.

**Orden de despliegue:**

1. Esqueleto desplegado en Railway con CI en verde y una página vacía (hora 2).
2. Esquema Prisma y seed. `prisma migrate deploy` corre en el arranque de Railway.
3. Simulador y núcleo de ingesta. A partir de aquí el flujo es demostrable de punta a punta sin dependencias externas.
4. Propuesta de pedido y backoffice de confirmación.
5. Alta del webhook de Meta contra la URL pública ya existente, con su timebox de 2 h.
6. Cola de armado.
7. Solo si sobra colchón: catálogo conversacional.

**Rollback:** Railway conserva los despliegues anteriores y permite revertir. Las migraciones de Prisma **no** son reversibles en este proyecto: si una migración es incorrecta, la recuperación es corregir hacia adelante y re-sembrar. Aceptable porque no hay datos de producción reales, y declarado como limitación.

## Open Questions

Ninguna cambia los specs, el enfoque ni el desglose de tareas; se pueden responder durante la implementación.

- **Ventana exacta del rate limit** por cliente. Se fija un valor razonable y se ajusta en pruebas.
- **Redacción concreta de los mensajes salientes** (acuse y resumen). Es contenido, no estructura.
- **Umbral de auto-refresco** del badge y del dashboard. 10 s es el punto de partida.
