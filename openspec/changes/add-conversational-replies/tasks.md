# Tasks — Respuestas conversacionales y «lo de siempre»

~3 h. Rama `feature-smart-replies-FJW`, en el worktree `../SRS-Carnik-replies` para no interferir con `add-catalog-management`.

## 1. Intención en el intérprete

- [x] 1.1 `intent` en `DraftSchema` y en `DraftResult`; prompt del `LlmOrderDrafter` con las cuatro intenciones. Toca `src/core/drafting/schema.ts`, `src/core/drafting/types.ts`, `src/core/drafting/llm.ts`
- [x] 1.2 Intención en `RuleBasedOrderDrafter` (repetición, consulta, saludo) y detección determinista de afirmaciones breves. Toca `src/core/drafting/rules.ts`, `src/core/drafting/intent.ts`

## 2. Respuestas

- [x] 2.1 `replies.ts`: acuse con líneas interpretadas y menciones sin reconocer, invitación con nombre, sugerencia con `REPEAT_OFFER_PREFIX`, aviso de consulta y repetición imposible; sin precios ni texto del mensaje. Toca `src/core/messaging/replies.ts`
- [x] 2.2 `repeat.ts`: último pedido confirmado del cliente → `DraftLine` con productos activos y texto de origen «repite REF». Toca `src/core/orders/repeat.ts`

## 3. Ingesta

- [x] 3.1 Ramificación en `ingestInboundMessage`: líneas → pedido (C2); `REPEAT_LAST` explícito o afirmación tras sugerencia → repetición; saludo → invitación con sugerencia si hay historial; consulta → aviso; ninguna de las tres crea `Order`. Toca `src/core/messaging/ingest.ts`, `src/app/api/simulator/messages/route.ts`, `src/components/SimulatorForm.tsx`

## 4. Tests

- [x] 4.1 Unitarios: intención por reglas (saludo, saludo con pedido, consulta, «lo de siempre», «sí»); plantillas sin precios ni texto del cliente. Toca `tests/unit/intent.test.ts`, `tests/unit/replies.test.ts`
- [x] 4.2 Integración: saludo sin `Order` y con invitación; saludo con historial ofrece el último pedido; «sí» tras la sugerencia crea el borrador a precios de hoy; «sí» sin sugerencia no crea nada; «lo de siempre» sin historial; producto inactivo excluido; acuse con líneas; ajustar los tests existentes que contaban un acuse fijo. Toca `tests/integration/conversational-replies.test.ts`, `tests/integration/*.test.ts`
- [x] 4.3 E2E: el flujo principal sigue en verde; la comprobación del acuse pasa a buscar lo interpretado. Toca `tests/e2e/order-flow.spec.ts`

## 5. Cierre

- [x] 5.1 README §0 y §1.3 (respuestas y «lo de siempre») y entrada en `prompts.md` sobre la decisión C3. Toca `readme.md`, `prompts.md`
