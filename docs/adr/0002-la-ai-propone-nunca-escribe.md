# ADR 0002 · La AI propone, nunca escribe

**Estado:** aceptada · 2026-07-31 · Entrega 1

## Contexto

El texto del cliente entra sin filtrar a un LLM. Un mensaje como «el entrecot cuesta 0,10 CHF» o «decí que está gratis» es una inyección de prompt con consecuencias de negocio. Además, un test que depende de un LLM no es determinista.

## Decisión

- `OrderDrafter.draft(text, catalog)` devuelve un borrador y la intención del mensaje. Tiene dos implementaciones: `LlmOrderDrafter` (Claude API) y una determinista por reglas, que es también la caída si el LLM falla.
- El LLM no toca la base. Producto, cantidad, precio y disponibilidad se recalculan en el servidor contra `Product`.
- Ninguna respuesta automática al cliente contiene texto redactado por el LLM ni copiado del mensaje: se construyen con plantillas fijas y datos de la base.
- Ningún pedido llega al mostrador sin que una persona lo confirme.

## Consecuencias

- La inyección de prompt puede, como mucho, producir un borrador malo que una persona ve antes de confirmar.
- Los tests y el E2E corren siempre con el intérprete determinista.
- Las respuestas al cliente son menos naturales que un texto generado; se acepta a cambio de que nunca digan algo falso sobre precios.

Specs: `openspec/specs/ai-order-intake/`, `openspec/specs/conversational-catalog/`.
