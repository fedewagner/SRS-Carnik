## Why

El catálogo se siembra y no hay forma de tocarlo: el dueño no puede cambiar un precio, dar de alta un corte nuevo ni cargar lo que se acaba de envasar, y las existencias sólo bajan con cada confirmación. En pocos días el `stockQuantity` deja de parecerse a lo que hay en la cámara, y con él pierden sentido los avisos de disponibilidad que hacen útil la propuesta de la AI.

## What Changes

- **Sección «Catálogo» en el backoffice** (`/admin/products`): lista de productos con unidad, precio unitario, existencias disponibles y lo **comprometido hoy** en pedidos confirmados.
- **Alta de producto** con nombre, unidad (kg o pieza), precio y existencias iniciales opcionales.
- **Cambio de precio unitario.** Se aplica a los pedidos nuevos **y recalcula los borradores abiertos** que contienen el producto; los pedidos confirmados no cambian.
- **Ingreso de existencias** tras envasar: suma una cantidad a lo disponible.
- **Reajuste por conteo físico.** El usuario anota lo que contó en el depósito; la pantalla muestra lo comprometido hoy en pedidos confirmados y calcula el disponible resultante (conteo − comprometido) antes de guardar. El motivo es obligatorio.
- **Registro de movimientos de existencias** (`StockMovement`): cada ingreso, reajuste, alta con existencias y **cada confirmación de pedido** deja un asiento con quién, cuándo, cantidad anterior, variación y resultado. La ficha del producto muestra su historial.
- Todo cambio de existencias recalcula el aviso de disponibilidad de las líneas en borrador de ese producto.

### Impacto visible para el usuario

- **Dueño (`ADMIN`):** mantiene precios y catálogo sin pedir un despliegue; ve por qué el stock de un producto vale lo que vale.
- **Empleado (`EMPLOYEE`):** carga lo envasado y corrige el stock tras contar la cámara; no puede tocar precios ni dar de alta productos.
- **Cliente:** el resumen al confirmar sale con el precio vigente, aunque el borrador se haya creado antes del cambio.

### Fuera de alcance

- **Baja, desactivación o renombrado de productos**, y edición de la unidad de uno existente.
- **Historial de precios:** el cambio de precio no se registra; sólo las existencias tienen libro de movimientos.
- **Estado «entregado» del pedido:** lo comprometido se aproxima como lo confirmado **hoy** (zona `Europe/Zurich`); ver design D4.
- **Venta sugerida o *upsell*** desde el detalle del pedido: queda anotado como `US-16` (Could).
- Precios por cliente, ofertas o precios con fecha de vigencia.

## Capabilities

### New Capabilities

- `catalog-management`: alta de productos, precio unitario, ingreso y reajuste de existencias con lo comprometido a la vista, y libro de movimientos de existencias —incluidas las confirmaciones—.

### Modified Capabilities

Ninguna en `openspec/specs/` (todavía vacío: `bootstrap-carnik` sin archivar). Afecta a dos Requirements de `order-confirmation` en `bootstrap-carnik`, que se reconcilian al archivar:

- *«Corrección de existencias desde la línea del pedido»* (`US-09`) queda **reemplazado** por el reajuste desde el catálogo; desaparece su nota «único punto de escritura de existencias, no hay pantalla de catálogo».
- *«Confirmación transaccional con descuento de existencias»* añade, dentro de la misma transacción, un asiento `ORDER_CONFIRMED` por línea.

## Impact

- **Historia:** `US-15 · Gestionar el catálogo, sus precios y sus existencias`; `US-09` pasa a reemplazada.
- **Datos:** migración con la tabla `StockMovement` y el enum `StockMovementType`. Escribe `Product`, `OrderItem` y `Order.totalCents` de borradores.
- **Código:** `src/core/catalog/*` (nuevo), `src/core/orders/confirm.ts`, páginas y server actions en `src/app/(staff)/admin/products/`, validación en `src/lib/validation/catalog.ts`, enlace en `src/app/(staff)/layout.tsx`.
- **Estimación:** ~3,5 h.
