# ADR 0001 · Monolito modular con adaptadores en dos fronteras

**Estado:** aceptada · 2026-07-31 · Entrega 1

## Contexto

Una persona, unas 22 h de implementación y Railway como plataforma. El volumen esperado es de decenas de mensajes al día. El requisito más importante del producto es que confirmar un pedido y descontar el stock ocurran juntos o no ocurran.

Hay exactamente dos puntos donde existen dos implementaciones reales que intercambiar: la entrada de mensajes (Twilio frente al simulador) y el intérprete de pedidos (LLM frente al determinista).

## Decisión

Un único despliegue Next.js con el dominio en `src/core/`, que no importa Next.js ni el proveedor de WhatsApp. Puertos y adaptadores **sólo** en esas dos fronteras: todo mensaje entrante se traduce a `InboundMessage` y desemboca en `ingestInboundMessage`; todo borrador sale de un `OrderDrafter`. El resto es monolito plano. Sin colas, microservicios ni caché distribuida.

## Consecuencias

- `confirmOrder` es una transacción de PostgreSQL, no una saga.
- El sistema entero, E2E incluido, corre en local y en CI sin red ni credenciales (`WHATSAPP_TRANSPORT=log`, `ORDER_DRAFTER=rules`).
- El cambio de Meta a Twilio (ADR 0003) sólo tocó `src/lib/twilio/` y una ruta nueva.
- A cambio, la ingesta no escala por separado del backoffice, y un envío saliente fallido no se reintenta solo: queda marcado como `FAILED` y visible.

Detalle: `readme.md` §2.1–2.2.
