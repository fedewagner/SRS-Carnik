# Tasks — Respuestas de catálogo (US-14)

Rama `feature-us14-catalog-answers-FJW`, en el worktree `../SRS-Carnik-us14`.

## 1. Productos consultados en el intérprete

- [x] 1.1 `askedProducts` en `DraftSchema` y en `DraftResult`; prompt del `LlmOrderDrafter` con la regla de consultas y filtrado de slugs fuera del catálogo (A1, A6). Toca `src/core/drafting/schema.ts`, `src/core/drafting/types.ts`, `src/core/drafting/llm.ts`
- [x] 1.2 Reglas: pregunta de precio o disponibilidad sin cifra ni expresión de pedido → `askedProducts` en vez de línea; `intentByRules` devuelve `QUESTION` con productos consultados (A2). Toca `src/core/drafting/rules.ts`, `src/core/drafting/intent.ts`

## 2. Respuesta

- [x] 2.1 Plantilla `catalogAnswerReply` con precio por unidad de venta y disponibilidad cualitativa, sin cantidades ni reserva (A3, A4). Toca `src/core/messaging/replies.ts`
- [x] 2.2 `catalogAnswerFor(slugs)`: relee `Product` activos por slug, en orden, máximo cinco; `null` si no aplica (A4). Toca `src/core/messaging/catalog-answer.ts`
- [x] 2.3 Rama `QUESTION` de la ingesta: respuesta de catálogo o aviso neutro (A5). Toca `src/core/messaging/ingest.ts`

## 3. Tests

- [x] 3.1 Unitarios: productos consultados e intención por reglas (precio, disponibilidad, varios, con cifra, con verbo de pedido, inexistente); plantilla sin texto del cliente ni cantidades de stock. Toca `tests/unit/rules-drafter.test.ts`, `tests/unit/intent.test.ts`, `tests/unit/replies.test.ts`
- [x] 3.2 Integración: precio de un producto, de varios, agotado, inactivo, inexistente, «¿abren el sábado?», consulta con pedido, instrucción embebida, más de cinco productos. Toca `tests/integration/catalog-answers.test.ts`
- [x] 3.3 Typecheck, lint y suite completa en verde; E2E vía CI del PR. Sin cambios en `tests/e2e/`

## 4. Verificación con la AI

- [x] 4.1 Verificación manual de la clasificación con el LLM real (≤10 llamadas) sobre los mensajes de los escenarios. Resultado: 7 de 8 como se esperaba; «¿tenés entrecot para mañana?» salió como consulta, lo que llevó a A7 (`promoteOrderSignal` en `src/core/drafting/index.ts`, `src/core/drafting/rules.ts`)
