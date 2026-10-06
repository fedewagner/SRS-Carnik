# CLAUDE.md · Carnik

Pedidos por WhatsApp para carnicerías: la AI redacta un borrador contra el catálogo y el stock reales, y una persona lo confirma. El detalle está en `readme.md`; las specs vivas, en `openspec/specs/`.

## Comandos

| Qué | Comando |
|---|---|
| Desarrollo | `npm run dev` (necesita PostgreSQL y `.env` a partir de `env.example`) |
| Lint y tipos | `npm run lint` · `npm run typecheck` |
| Tests | `npm test` (unit + integración, contra la base de `tests/test.env`) · `npm run test:e2e` |
| Base | `npm run db:migrate` · `npm run db:seed` |
| Specs | `openspec list` · `openspec validate --specs` |

Antes de dar una tarea por hecha: `npm run lint && npm run typecheck && npm test` en verde.

## Arquitectura

Monolito modular Next.js 15 + Prisma 6 + PostgreSQL 16, con puertos y adaptadores en **dos fronteras y en ninguna más** (ver `docs/adr/0001`).

- `src/core/` — dominio: ingesta, redacción, valoración, confirmación, catálogo. **No importa Next.js ni Twilio.**
- `src/app/api/` — route handlers. Hacen cuatro cosas: autorizar, validar con Zod, llamar al núcleo, traducir a HTTP. Un `if` de negocio aquí está en el sitio equivocado.
- `src/lib/twilio/` — único sitio que conoce a Twilio. Todo mensaje entrante se traduce a `InboundMessage` en el borde.
- `src/core/drafting/` — `OrderDrafter` con dos implementaciones: LLM y determinista (`ORDER_DRAFTER=rules`).

## Reglas que no se negocian

1. **La AI propone, nunca escribe.** El LLM devuelve un borrador; precios, cantidades y disponibilidad se recalculan en el servidor contra la base. Ninguna respuesta automática al cliente contiene texto redactado por el LLM ni copiado del mensaje (`docs/adr/0002`).
2. **Ningún pedido llega al mostrador sin confirmación humana.** La confirmación descuenta el stock en la misma transacción.
3. **Dinero en céntimos `Int`, cantidades en `Decimal(10,3)`.** Nunca `float` para importes (`docs/adr/0004`).
4. **La firma de Twilio se valida contra `TWILIO_WEBHOOK_URL`**, nunca reconstruyendo la URL desde `X-Forwarded-*` (`docs/adr/0003`).
5. **Secretos fuera del repo.** No leer ni escribir `.env`; la referencia es `env.example` (sin punto, ver `docs/adr/0005`). Nada de `--no-verify`.
6. **Tests sin red.** CI corre con `ORDER_DRAFTER=rules` y `WHATSAPP_TRANSPORT=log`. Un test que llama a un LLM o a Twilio es un test roto.
7. **Datos personales.** La cola de armado (`/dashboard`) no muestra datos del cliente; una respuesta de catálogo sólo contiene datos de `Product`.

## Flujo de trabajo

- Cada cambio de comportamiento empieza como change de OpenSpec: `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. El código sigue a la spec, no al revés.
- Una rama y un PR por change. Commits convencionales en español (`feat(orders): …`).
- Todo `fix:` deja un test que fallaba antes del arreglo.
- Para revisar un diff contra la spec, usar el subagente `spec-reviewer` (`.claude/agents/spec-reviewer.md`); el mismo criterio corre en CI según `REVIEW.md`.
