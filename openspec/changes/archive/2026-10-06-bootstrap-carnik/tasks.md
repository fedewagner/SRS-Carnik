# Tasks — Bootstrap Carnik (MVP recortado a dos días)

**Replanificación del 2026-10-04.** La entrega se adelantó a dos días de trabajo (martes 2026-10-06) sin código escrito. El plan original de 28 tareas (~20 h) no entra: se sustituye por un **piso de 17 tareas (~10 h)** que conserva el flujo E2E y los ocho artefactos del proyecto, y se ejecuta el orden de caída del `proposal.md` hasta el escalón 3 (integración real con Meta fuera; queda el simulador).

| Grupo | Tareas | Estimación |
|---|---:|---:|
| 1 · Esqueleto desplegado | 2 | 1,5 |
| 2 · Modelo de datos y seed | 2 | 1,0 |
| 3 · Autenticación y autorización | 1 | 0,5 |
| 4 · Entrada por simulador | 2 | 1,0 |
| 5 · AI Order Intake | 4 | 1,75 |
| 6 · Backoffice de confirmación | 2 | 2,0 |
| 7 · Tests y CI completo | 3 | 2,0 |
| 8 · Cierre | 1 | 0,5 |
| **Total** | **17** | **~10 h** |

**Regla de control:** al cerrar el día 1 la URL pública muestra un borrador creado desde el simulador. Si no, la tarea 5.3 (`LlmOrderDrafter`) cae sin discusión.

## 1. Esqueleto desplegado

- [x] 1.1 Andamiaje Next.js 15 (App Router, TypeScript estricto, Tailwind), redirección de `/` según sesión y cabeceras de seguridad en `next.config.ts`.
- [x] 1.2 Prisma y cliente compartido, `.env.example`, workflow de CI (lint, typecheck, build) y despliegue en Railway con PostgreSQL y `prisma migrate deploy` en el arranque.

## 2. Modelo de datos y seed

- [x] 2.1 Siete entidades de D2 con sus enums e índices, migración inicial con los dos `CHECK` añadidos a mano (`stockQuantity >= 0` y coherencia de los campos de confirmación).
- [x] 2.2 Seed idempotente: catálogo de carnicería (por peso y por pieza) y dos usuarios (`ADMIN`, `EMPLOYEE`) con contraseña hasheada.

## 3. Autenticación y autorización

- [x] 3.1 Sesión `iron-session` (TTL 8 h, sin renovación), login y logout con argon2id, `requireRole` como primera línea de cada handler, server action y layout protegido.

## 4. Entrada por simulador

- [x] 4.1 `InboundMessage` e `ingestInboundMessage`: alta o reutilización de `Customer` y `Conversation`, persistencia del `Message`.
- [x] 4.2 `POST /api/simulator/messages` protegido por `requireRole` y `SIMULATOR_ENABLED`, y página `/simulator` que muestra el borrador resultante.

## 5. AI Order Intake

- [x] 5.1 Contrato `OrderDrafter` y `DraftSchema` (sin precios, totales ni disponibilidad).
- [x] 5.2 `RuleBasedOrderDrafter` determinista sobre alias del catálogo.
- [x] 5.3 `LlmOrderDrafter` con salida estructurada, timeout de 8 s y caída al determinista; selector `ORDER_DRAFTER`. **Primera tarea en caer si el día 1 se retrasa.**
- [x] 5.4 Precios y disponibilidad calculados en servidor y creación del `Order` en `DRAFT` con sus `OrderItem`, incluidas las líneas sin resolver.

## 6. Backoffice de confirmación

- [x] 6.1 Listado de pedidos (`/admin/orders`) y detalle con líneas, avisos de disponibilidad, total y conversación.
- [x] 6.2 `confirmOrder` transaccional e idempotente (D10) expuesto en `POST /api/orders/[orderId]/confirm`, botón con sus estados, y resumen al cliente registrado como `Message` saliente después del commit con transporte `log` (D12).

## 7. Tests y CI completo

- [x] 7.1 Unitarios: precios y `RuleBasedOrderDrafter`.
- [x] 7.2 Integración contra PostgreSQL: confirmación con existencias suficientes e insuficientes (rollback), doble confirmación y acceso sin sesión.
- [x] 7.3 E2E con Playwright: simulador → borrador → confirmación → existencias descontadas y resumen registrado. CI con servicio PostgreSQL ejecutando todo.

## 8. Cierre

- [x] 8.1 `readme.md` con URL pública, alcance entregado frente a especificado, capturas e instrucciones; `prompts.md` actualizado.

## Fuera de esta entrega (decidido, no omitido)

En orden de reincorporación si hubiera tiempo después de la entrega:

1. Ajuste de líneas (US-08) y corrección de existencias desde la línea (US-09).
2. Acuse automático y mensaje manual del empleado (US-12).
3. Webhook real de Meta Cloud API con firma HMAC (US-01) y transporte `meta`.
4. Cola de armado en `/dashboard` (US-13), badge con polling y rate limit (US-03).
5. Catálogo conversacional (US-14, Could-Have).
