# ADR 0004 · Dinero en céntimos y precio copiado en la línea

**Estado:** aceptada · 2026-07-31 · Entrega 1

## Contexto

La carnicería cobra por peso. Un error de redondeo en coma flotante es dinero real, y un cambio de precio en el catálogo no debe alterar pedidos ya confirmados.

## Decisión

- Importes en `Int` de céntimos (`pricePerUnitCents`, `unitPriceCents`). Ningún importe es coma flotante.
- Cantidades en `Decimal(10,3)`, suficiente para gramos.
- `OrderItem.unitPriceCents` copia el precio vigente al crear la línea. Un cambio de precio revalora los borradores abiertos, nunca los confirmados.

## Consecuencias

- Hay que convertir en cada frontera de entrada y salida, y operar con `Decimal` de Prisma en lugar de `number`.
- Línea y catálogo pueden discrepar a propósito: un pedido confirmado conserva el precio con el que se confirmó.

Detalle: `readme.md` §3, «Cinco decisiones de modelado».
