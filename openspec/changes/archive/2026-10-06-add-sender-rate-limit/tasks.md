# Tasks — Límite de consumo por remitente (US-03)

~1,5 h. Rama `feature-us03-rate-limit-FJW`, en el worktree `../SRS-Carnik-us03`.

## 1. Núcleo

- [x] 1.1 `isOverMessageLimit` y constantes `RATE_LIMIT_MAX_MESSAGES` / `RATE_LIMIT_WINDOW_MS`, con exclusión de los mensajes recibidos con borrador abierto; aviso único por ventana. Toca `src/core/messaging/rateLimit.ts`
- [x] 1.2 Plantilla `rateLimitReply`. Toca `src/core/messaging/replies.ts`

## 2. Ingesta

- [x] 2.1 Guarda temprana en `ingestInboundMessage` y resultado `rate_limited`. Toca `src/core/messaging/ingest.ts`
- [x] 2.2 Rama `rate_limited` en la respuesta del simulador. Toca `src/app/api/simulator/messages/route.ts`

## 3. Tests

- [x] 3.1 Integración: dentro del límite procesa; por encima registra sin llamar al drafter (spy) ni crear `Order`; aviso una sola vez; fin de ventana; aclaraciones con borrador abierto no cuentan. Toca `tests/integration/rate-limit.test.ts`
- [x] 3.2 Typecheck, lint y suite completa en verde. Toca `tests/**`
