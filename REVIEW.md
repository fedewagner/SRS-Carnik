# REVIEW.md · Criterio de revisión

Lo usan el subagente `spec-reviewer` en local y el workflow `ai-review.yml` en cada PR. El revisor compara el diff contra las specs de `openspec/specs/` y las reglas de `CLAUDE.md`, no contra el gusto.

## Graves (se reportan siempre)

1. **El LLM escribe estado o texto al cliente.** Una salida del `OrderDrafter` llega a la base sin recalcular, o una respuesta automática contiene texto del modelo o del mensaje entrante.
2. **Confirmación sin transacción.** El cambio de estado del pedido y el descuento de stock pueden quedar desacoplados.
3. **Dinero en coma flotante.** Un importe se calcula o persiste como `number` no entero.
4. **Frontera rota.** `src/core/` importa Next.js, Twilio o `Request`/`Response`; o un route handler contiene reglas de negocio.
5. **Autenticación o autorización ausente.** Un endpoint o server action nuevo no comprueba sesión y rol; el webhook acepta peticiones sin firma válida.
6. **Fuga de datos personales.** Datos de un cliente aparecen en la conversación de otro, en la cola de armado o en logs.
7. **Secretos.** Una credencial en código, en un fixture o en un log.

## Menores (como máximo tres por revisión)

- Un comportamiento nuevo sin escenario en la spec o sin test.
- Un `fix:` sin test que lo cubra.
- Nombres o comentarios que contradicen la spec.

## Qué no se reporta

Estilo que ESLint ya cubre, preferencias de formato, refactors no pedidos.

## Formato del informe

```
## Graves
- <fichero:línea> — <qué regla rompe> — <escenario concreto que falla>
## Menores
- …
## Veredicto
OK | CAMBIOS NECESARIOS
```

Sin graves ni menores, el informe es una línea: `Veredicto: OK`.
