## Context

Ver `proposal.md` para la motivación y el Requirement *«Cola de armado como proyección de solo lectura»* de `bootstrap-carnik/specs/order-confirmation/spec.md` para el comportamiento. Estado de partida:

- `listOrders(status?)` (`src/core/orders/queries.ts`) es la consulta del listado del backoffice: `Order` con `include: { customer: true, _count }`. Trae el `Customer` entero, teléfono incluido, y no trae las líneas.
- `confirmOrder` fija `Order.status = CONFIRMED` y `Order.confirmedAt`, y descuenta existencias sólo de las líneas con `productId`; el resumen al cliente lista sólo esas líneas.
- No hay estado posterior a `CONFIRMED`: el estado `ASSEMBLED` se revirtió a propósito y no vuelve en este change.
- D13 del bootstrap fija el mecanismo: polling, nada de realtime; el dashboard reutiliza la consulta del backoffice con filtro `CONFIRMED` y proyecta menos campos.
- En paralelo avanzan `US-07` (indicador de pendientes en `src/app/(staff)/layout.tsx` y `GET /api/orders/pending-count`) y el PR de catálogo, que migra `prisma/schema.prisma`. Este change no toca el esquema.

## Goals / Non-Goals

**Goals:**

- Que el teléfono y la conversación del cliente no salgan de PostgreSQL hacia esta vista, ni en el HTML ni en el JSON del refresco.
- Que un fallo de red o de servidor nunca se lea como «no hay trabajo».
- Un único criterio de qué pedidos entran, calculado en el servidor.

**Non-Goals:**

- Cerrar el ciclo del pedido (armado, entregado). Sin estado nuevo, la cola no puede vaciarse por acción del obrador.
- Una sesión de kiosco distinta de la del empleado.

## Decisions

### A1 — Entran los pedidos confirmados hoy, en `Europe/Zurich`

La cola muestra los `Order` con `status = CONFIRMED` y `confirmedAt` desde la medianoche de hoy en `Europe/Zurich` (calculada en el servidor en cada consulta, con cambio de horario incluido), ordenados por `confirmedAt` ascendente y con tope de 100. Es la lectura operativa de «pendientes de armado» sin un estado que lo marque: lo que se confirmó hoy es lo que hoy se arma.

*Alternativas consideradas:* **todos los confirmados** — rechazada: sin estado `ASSEMBLED`, la cola crece sin fin y deja de servir a las dos semanas. **Ventana móvil (últimas N horas)** — rechazada: a primera hora mezcla lo de ayer por la tarde, y «desde cuándo» deja de ser obvio para quien mira la pantalla. **Reintroducir `ASSEMBLED`** — fuera de alcance por decisión del producto y porque exige migración en paralelo a la del PR de catálogo.

*Trade-off:* un pedido confirmado a las 23:50 desaparece a medianoche aunque no se haya armado, y uno ya armado a las 9:00 sigue en pantalla hasta el cierre. Ambos son aceptables para una carnicería que cierra por la tarde; el pedido sigue visible en `/admin/orders`.

### A2 — Misma consulta, proyección distinta en la base

`queries.ts` extrae el filtro a `orderListWhere({ status, confirmedSince })`, que usan tanto `listOrders` (sin cambios de comportamiento) como la nueva `listAssemblyQueue(since)`. Esta última hace su propio `findMany` con un `select` explícito: `reference`, `confirmedAt`, `customer.profileName` y las líneas con producto (`productId` no nulo) con `quantity`, `product.name` y `product.unit`. No selecciona `phoneE164`, `conversation` ni `rawText`.

*Alternativa considerada:* llamar a `listOrders("CONFIRMED")` tal cual y quitar campos en memoria. **Rechazada:** `include: { customer: true }` carga el teléfono en el proceso y basta un descuido en el mapeo para que llegue al JSON; además no trae las líneas y obligaría a una segunda consulta por pedido. *Trade-off:* hay dos `findMany` en el módulo en lugar de uno; el criterio de filtrado sí es único.

### A3 — La proyección es un DTO plano y sin datos personales

`src/core/orders/assemblyQueue.ts` convierte cada fila en `{ id, reference, customerName, confirmedAt, confirmedTime, lines: [{ id, productName, quantityLabel }] }`:

- `customerName`: primera palabra de `profileName`, recortada a 24 caracteres; si no hay nombre, «Cliente». El nombre de perfil lo elige el cliente en WhatsApp; se muestra sólo el nombre de pila.
- `confirmedTime`: `HH:MM` en `Europe/Zurich`, formateado en el servidor para que no dependa de la zona del navegador del kiosco.
- `quantityLabel`: el mismo formato que el resumen al cliente (`1.5 kg`, `6 u.`).
- Las líneas sin producto no se muestran: no descontaron existencias ni figuran en el resumen que recibió el cliente; mostrar su `rawText` sería mostrar texto de la conversación.

### A4 — Refresco por polling desde un componente cliente, cada 20 s

La página (`src/app/(staff)/dashboard/page.tsx`, Server Component) renderiza la primera carga con `getAssemblyQueue()` y se la pasa a `AssemblyQueue` (`src/components/AssemblyQueue.tsx`), que cada 20 s pide `GET /api/orders/assembly-queue` con `cache: "no-store"`.

- **Éxito:** reemplaza la lista y la hora de «última actualización».
- **Fallo** (red, respuesta no 2xx o cuerpo sin la forma esperada): conserva la última lista y muestra un aviso visible «Datos posiblemente desactualizados», con la hora de la última actualización correcta. Con 401 el aviso dice que la sesión venció. Nunca se sustituye la lista por el estado vacío.
- **Vacío real:** mensaje explícito «No hay pedidos por armar» y el sondeo sigue.

*Alternativa considerada:* `router.refresh()` periódico sobre el Server Component. **Rechazada:** no hay forma fiable de saber si el refresco falló, y un error de servidor reemplaza el contenido por el error boundary; el escenario de error del spec exige lo contrario. *Trade-off:* un endpoint JSON más que mantener, a cambio de controlar el fallo.

*Intervalo:* 20 s, dentro del rango de D13. A decenas de pedidos al día y una pantalla, son ~3 consultas por minuto.

### A5 — Autorización y validación

- La página llama a `requireRoleOrRedirect(STAFF)` como primera línea; el route handler llama a `requireRole(STAFF)` antes de tocar la base y responde 401 sin sesión, como `POST /api/orders/[orderId]/confirm`.
- **Entrada de usuario:** el endpoint es un `GET` que no lee parámetros, cuerpo ni cabeceras propias; no hay entrada que validar en servidor. El instante de corte lo calcula el servidor. La comprobación de forma de la respuesta en el cliente es sólo defensiva.
- **Variables de entorno:** ninguna nueva.

### A6 — Enlace en la navegación, sin layout propio

La página vive en el grupo `(staff)` y hereda su layout; el único cambio en `src/app/(staff)/layout.tsx` es un `Link` a `/dashboard`, para minimizar el conflicto con `US-07`, que modifica el mismo fichero. La legibilidad a distancia se logra con tipografía grande dentro del `main` existente.

*Trade-off:* la barra de navegación ocupa espacio en la pantalla del obrador y permite salir de la vista; un layout de kiosco a pantalla completa queda para cuando haya una sesión de kiosco.

## Risks / Trade-offs

- [La sesión expira a las 8 h (D4) y el kiosco deja de actualizar] → el aviso de 401 lo hace visible en la pantalla; se vuelve a iniciar sesión. No se extiende la sesión para este caso.
- [Corte de medianoche (A1)] → aceptado; el backoffice sigue mostrando el pedido.
- [`profileName` puede contener un apellido o un apodo] → sólo se muestra la primera palabra, recortada.
- [Más de 100 pedidos confirmados en un día] → fuera del volumen del producto; el tope evita una respuesta sin límite.
- [Conflicto con `US-07` en `layout.tsx` y con quien toque `queries.ts`] → cambio de una línea en el layout; en `queries.ts` sólo se extrae el filtro y se añade una función.

## Migration Plan

Sin migraciones ni variables nuevas. Se despliega con el resto; revertir es quitar la página, el endpoint y el enlace.
