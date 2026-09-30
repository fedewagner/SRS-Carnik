# Tasks — Bootstrap Carnik (MVP)

**28 tareas must-have** (grupos 1–9). Dos presupuestos, y conviene mirar los dos:

| Grupo | Tareas | A 45 min | A 90 min | Estimación |
|---|---:|---:|---:|---:|
| 1 · Esqueleto desplegado | 3 | 2,25 | 4,5 | 2,5 |
| 2 · Modelo de datos y seed | 2 | 1,50 | 3,0 | 1,5 |
| 3 · Autenticación y autorización | 1 | 0,75 | 1,5 | 1,0 |
| 4 · WhatsApp entrante | 4 | 3,00 | 6,0 | **2,0** ⚠ |
| 5 · AI Order Intake | 4 | 3,00 | 6,0 | 3,0 |
| 6 · Backoffice de confirmación | 5 | 3,75 | 7,5 | 4,5 |
| 7 · WhatsApp saliente | 2 | 1,50 | 3,0 | 1,5 |
| 8 · Tests y CI completo | 5 | 3,75 | 7,5 | **3,0** ⚠ |
| 9 · Cierre | 2 | 1,50 | 3,0 | 1,0 |
| **Total** | **28** | **21,00** | **42,00** | **20,0** |

⚠ Los grupos **4** y **8** son los que estimé por debajo del suelo de la banda (el 4 asume 30 min por tarea). Si algo se va a desbordar, empieza por ahí — son el termómetro temprano.

Entra en el suelo de la banda con ~1 h de margen sobre las 22 h. **No entra en el techo**, y ningún recorte que preserve el flujo lo arregla: el andamiaje obligatorio —grupos 1, 2, 3, 8 y 9— ya son 13 tareas por sí solo, así que bajar de ~26 exige romper el flujo E2E. Si el ritmo real se acerca al techo, se ejecuta el **orden de caída pre-comprometido** del `proposal.md` en vez de improvisar un recorte nuevo.

**Regla de control:** al terminar el grupo 4 tenés 10 tareas hechas. Si llevás más de 8 h, estás corriendo hacia el techo y toca ejecutar el escalón 1 del orden de caída, no confiar en recuperar después.

El grupo 10 es la capacidad **should-have** y solo se implementa si sobra colchón. Nada depende de él.

## 1. Esqueleto desplegado (2,5 h)

- [ ] 1.1 Andamiaje Next.js 15 con App Router, TypeScript estricto y Tailwind; redirección de `/` según sesión; **cabeceras de seguridad** (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) en la configuración. Toca `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.gitignore`
- [ ] 1.2 Instalar Prisma, crear el cliente compartido y declarar las variables de entorno. Toca `prisma/schema.prisma` (solo datasource y generator), `src/lib/db.ts`, `.env.example`
- [ ] 1.3 Workflow de CI con lint, typecheck y build, y despliegue en Railway con PostgreSQL y `prisma migrate deploy` en el arranque; verificar que la URL pública responde con CI en verde. Toca `.github/workflows/ci.yml`, `package.json` (scripts `build`/`start`), `railway.json`, `README.md`

## 2. Modelo de datos y seed (1,5 h)

- [ ] 2.1 Definir `User`, `Product` (con `stockQuantity` como campo), `Customer`, `Conversation`, `Message`, `Order`, `OrderItem` con sus enums e índices —incluido el único de `Message.providerMessageId` y el compuesto `(status, createdAt)` de `Order`— y generar la migración inicial. `Order` conserva sólo `customerId` y `sourceMessageId` (sin `conversationId`); añade `fulfillmentStatus`, `assembledAt` y `assembledByUserId`. `OrderItem` incluye `resolutionStatus`, producto nullable, texto original, unidad/cantidad nullable e importes enteros según D2–D3. `Message.summaryOrderId` nullable y único soporta el outbox y sus estados D12. Sin tabla de historial de estados y sin `REJECTED` en el enum. **Añadir a mano en el SQL de la migración dos restricciones `CHECK`**, que el DSL de Prisma no soporta: `stockQuantity >= 0`, y coherencia entre `Order.status` y sus campos de confirmación. Toca `prisma/schema.prisma`, `prisma/migrations/`
- [ ] 2.2 Seed idempotente con catálogo realista de carnicería (productos por peso y por pieza, con existencias iniciales) y dos usuarios (`ADMIN`, `EMPLOYEE`) con contraseña hasheada. Datos de cliente sintéticos. Toca `prisma/seed.ts`, `package.json`

## 3. Autenticación y autorización (1 h)

- [ ] 3.1 Sesión por cookie firmada `httpOnly`/`secure`/`sameSite=lax` con **TTL de 8 h y sin renovación deslizante**, expiración absoluta en `src/lib/auth/session.ts` fijada al login y nunca extendida por actividad o lectura de sesión, login y logout contra `User.passwordHash` hasheada con **argon2id**, más el helper `requireRole` invocado en los layouts de `/admin` y `/dashboard`. **Sin `middleware.ts`**: la redirección por comodidad la hace el propio layout, de modo que no exista un fichero que alguien pueda confundir con el control de seguridad. Toca `src/lib/auth/session.ts`, `src/lib/auth/guard.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/admin/layout.tsx`, `src/lib/validation/auth.ts`

## 4. WhatsApp entrante (2 h)

- [ ] 4.1 Tipo de dominio `InboundMessage` e `ingestInboundMessage`: alta o reutilización de `Customer` y `Conversation`, persistencia del `Message`, e idempotencia capturando la violación de unicidad de `providerMessageId`. Toca `src/core/messaging/types.ts`, `src/core/messaging/ingest.ts`
- [ ] 4.2 Ruta del webhook de Meta: `GET` de handshake con `hub.mode=subscribe`, validación de `hub.verify_token` contra `META_VERIFY_TOKEN` y retorno de `hub.challenge` como texto; 403 para token ausente/incorrecto y 400 para modo/challenge inválidos con token válido, y `POST` que lee el cuerpo crudo, verifica HMAC-SHA256 en tiempo constante, deja pasar los mensajes de texto, filtra eventos de estado y rechaza los que traen adjunto sin descargarlos. Toca `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/whatsapp/signature.ts`, `src/lib/whatsapp/parse.ts`
- [ ] 4.3 Canal de simulación: ruta `POST` protegida por `requireRole` y por `SIMULATOR_ENABLED`, más la página para usarlo, que **muestra el borrador resultante con sus líneas e importes** — es lo que hace observables los grupos 4 y 5 sin esperar al backoffice. Toca `src/app/api/simulator/messages/route.ts`, `src/app/simulator/page.tsx`, `src/lib/validation/messaging.ts`
- [ ] 4.4 Límite de mensajes por conversación en una ventana de tiempo, evaluado antes de invocar al proveedor de AI. Toca `src/core/messaging/rateLimit.ts`

## 5. AI Order Intake (3 h)

- [ ] 5.1 Filtro must-have de intención previo a cualquier drafter (`ORDER`, `CATALOG_QUERY`, `OTHER_OR_UNCERTAIN`), sin pedido ni acuse para consultas/saludos/incertidumbre; contrato `OrderDrafter` y esquema Zod `DraftSchema` de la salida (sin precios, sin totales, sin disponibilidad). Toca `src/core/drafting/intent.ts`, `src/core/messaging/ingest.ts`, `src/core/drafting/types.ts`, `src/core/drafting/schema.ts`
- [ ] 5.2 `RuleBasedOrderDrafter`: parser determinista de cantidad, unidad y alias de producto sobre el catálogo, sin red. Toca `src/core/drafting/rules.ts`
- [ ] 5.3 `LlmOrderDrafter` con `@anthropic-ai/sdk` y salida estructurada, timeout de 8 s, y caída al fallback ante error, timeout o salida que no valide; selector por `ORDER_DRAFTER`. Toca `src/core/drafting/llm.ts`, `src/core/drafting/index.ts`
- [ ] 5.4 Validación de producto, unidad y cantidad (kg a 0,001; piezas enteras) antes de persistir; snapshot de precio por línea, multiplicación Decimal y redondeo `ROUND_HALF_UP` por línea; suma de líneas redondeadas para `totalCents` y disponibilidad contra `Product`, y creación del `Order` en `DRAFT` con sus `OrderItem`, incluidas las líneas sin resolver y los avisos de disponibilidad. `Order.reference` se deriva de **los seis últimos caracteres del `cuid` en mayúsculas** — único por construcción, sin contador ni condición de carrera. Toca `src/core/orders/pricing.ts`, `src/core/orders/createDraft.ts`

## 6. Backoffice de confirmación (4 h)

- [ ] 6.1 Consulta compartida de pedidos con filtro por estado, usada por el listado de pendientes con su badge (polling cada 10 s, conserva el último valor conocido ante fallo) y por la cola de armado en `/dashboard` (filtros `CONFIRMED` y `fulfillmentStatus=PENDING`, proyección sin teléfono ni conversación, estado vacío explícito). El handler `GET` de pending-count debe ejecutar `requireRole(['EMPLOYEE', 'ADMIN'])` como primera operación, antes de cualquier consulta de conteo o lógica de respuesta. Toca `src/core/orders/queries.ts`, `src/app/admin/orders/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/api/orders/pending-count/route.ts`, `src/components/PendingBadge.tsx`
- [ ] 6.2 Detalle en una sola pantalla: líneas con avisos de disponibilidad, total, conversación completa y acción de confirmar, de modo que un pedido sin ajustes se confirme en dos interacciones desde el listado. Añade la server action `markAssembled` con `requireRole`, transición idempotente `CONFIRMED/PENDING → ASSEMBLED` y auditoría, invocable desde el detalle. Incluye la máquina de estados del botón de confirmar —inicial, carga, error `409` señalando la línea, éxito, ya confirmado y sin líneas—. Toca `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/orders/[id]/actions.ts`, `src/components/ConfirmOrderButton.tsx`, `src/components/OrderLineRow.tsx`
- [ ] 6.3 Server actions de ajuste de líneas (cambiar cantidad, eliminar, añadir del catálogo) con validación Zod, `requireRole`, recálculo de importes y conservando el snapshot al cambiar sólo cantidad y capturando precio al añadir/sustituir/resolver producto, más rechazo si el pedido no está en `DRAFT`. Toca `src/app/admin/orders/[id]/actions.ts`, `src/lib/validation/orders.ts`
- [ ] 6.4 Server action de corrección de existencias desde la línea, con `requireRole`, comprobación atómica de `Product.isActive=true`, unidad y precisión permitidas y cantidad no negativa. Toca `src/core/stock/adjust.ts`, `src/app/admin/orders/[id]/actions.ts`
- [ ] 6.5 `confirmOrder` según D10: bloqueo compartido con ediciones, validación previa de al menos una línea y productos resueltos (`409 EMPTY_ORDER`/`UNRESOLVED_ORDER_ITEMS`), cambio condicional de estado con auditoría, descuento de stock y creación del outbox `Message` único por pedido en una transacción. Cualquier fallo de stock revierte todo. Expuesto además como **route handler** —única mutación del backoffice que no es server action— para poder verificar la idempotencia con dos peticiones concurrentes desde los tests. Toca `src/core/orders/confirm.ts`, `src/app/api/orders/[orderId]/confirm/route.ts`

## 7. WhatsApp saliente (1,5 h)

- [ ] 7.1 Transporte con modos `meta` y `log` según `WHATSAPP_TRANSPORT`, registrando cada envío como `Message` saliente con su estado. Toca `src/lib/whatsapp/transport.ts`, `src/core/messaging/outbound.ts`
- [ ] 7.2 Acuse automático tras crear el borrador, despacho del outbox del resumen tras el commit, con clave estable por pedido, claim atómico, recuperación autenticada de `PENDING`/`FAILED` y reconciliación de `UNKNOWN` según D12 y mensaje manual del empleado desde el detalle, rechazando en servidor los vacíos y los que superan el límite del canal. Toca `src/core/messaging/outbound.ts`, `src/app/admin/orders/[id]/actions.ts`

## 8. Tests y CI completo (3 h)

- [ ] 8.1 Configurar Vitest y Playwright, base de datos de test con migraciones y truncado entre casos, y `WHATSAPP_TRANSPORT=log`. Toca `vitest.config.ts`, `playwright.config.ts`, `tests/setup.ts`, `package.json`
- [ ] 8.2 Tests unitarios de precios D3 (1001 × 0,333 → 333; × 0,500 → 501; × 0,667 → 668; dos líneas de 501 suman 1002), snapshots ante cambio de catálogo y ajuste de cantidad, filtro de intención, `RuleBasedOrderDrafter`, firma HMAC, handshake GET y validación de unidades/cantidades inválidas. Toca `tests/unit/`
- [ ] 8.3 Tests de integración: firma válida, inválida y mensaje duplicado; confirmación con existencias suficientes e insuficientes (rollback incluso tras descontar una línea); pedido vacío y líneas sin resolver/producto ausente sin mutaciones; doble confirmación concurrente; outbox único, fallo de proveedor, caída después del commit y recuperación sin duplicados; rechazo de ajuste de producto inactivo; armado idempotente y exclusión de la cola; pending-count sin sesión/rol rechazado antes de consultar; sesión expirada a las 8 h aunque haya actividad; acceso sin sesión a las server actions del backoffice. Toca `tests/integration/`
- [ ] 8.4 Test E2E único contra el simulador: mensaje entrante → borrador → ajuste de cantidad → confirmación en dos interacciones → existencias descontadas y mensaje saliente registrado. Toca `tests/e2e/order-flow.spec.ts`
- [ ] 8.5 Añadir al workflow el servicio PostgreSQL, las migraciones, los pasos de test unitario, integración y E2E, y **`npm audit --audit-level=high`**, de modo que una vulnerabilidad alta o crítica ponga el pipeline en rojo. Toca `.github/workflows/ci.yml`

## 9. Cierre (1 h)

- [ ] 9.1 `SECURITY.md` con lo implementado (firma HMAC, idempotencia, límite por cliente, autorización por rol y por estado en servidor, sin adjuntos, sin PII en logs, sin identificadores del cliente hacia el proveedor de AI) y la deuda declarada (retención, DPAs, transferencia internacional, derecho de borrado, sesión propia). Toca `SECURITY.md`
- [ ] 9.2 `readme.md` siguiendo la plantilla AI4Devs-finalproject, secciones §0 a §7, con la URL pública, los siete supuestos declarados y el orden de caída del proposal. Toca `readme.md`

## 10. Should-have — Catálogo conversacional (solo si sobra colchón)

- [ ] 10.1 Conectar las consultas `CATALOG_QUERY` del filtro must-have de 5.1 con la respuesta opcional de catálogo; mantener sin respuesta ni pedido los mensajes de intención incierta. Toca `src/core/drafting/intent.ts`
- [ ] 10.2 Respuesta automática construida desde los datos de `Product`, nunca desde texto generado sobre precios; registrada en la `Conversation`; sin crear `Order`. Toca `src/core/messaging/catalogReply.ts`, `src/core/messaging/ingest.ts`
