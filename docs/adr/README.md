# Registro de decisiones de arquitectura

Cada ADR recoge una decisión que condiciona el código y que no se deduce leyéndolo. El razonamiento completo y los trade-offs están en `readme.md`; aquí queda la decisión, su contexto y sus consecuencias, en una página.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-monolito-modular-dos-fronteras.md) | Monolito modular con puertos y adaptadores sólo en dos fronteras | Aceptada |
| [0002](0002-la-ai-propone-nunca-escribe.md) | La AI propone un borrador, nunca escribe estado ni texto al cliente | Aceptada |
| [0003](0003-whatsapp-via-twilio.md) | WhatsApp vía Twilio Sandbox en lugar de Meta Cloud API | Aceptada · reemplaza la D7 de la Entrega 1 |
| [0004](0004-dinero-en-centimos.md) | Dinero en céntimos `Int`, cantidades en `Decimal(10,3)`, precio copiado en la línea | Aceptada |
| [0005](0005-env-example-sin-punto.md) | El fichero de ejemplo se llama `env.example`, sin punto | Aceptada |

Formato: contexto, decisión, consecuencias. Una decisión nueva que cambie una de estas crea un ADR nuevo que la reemplaza; el anterior no se borra.
