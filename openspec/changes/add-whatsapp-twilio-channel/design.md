## Context

Ver `proposal.md` para la motivación. El estado de partida, tras el change `bootstrap-carnik`:

- `ingestInboundMessage(InboundMessage)` en `src/core/messaging/ingest.ts` es el único punto de entrada al dominio. El simulador ya lo usa; el núcleo no conoce a ningún proveedor (D6 del bootstrap).
- `Message.providerMessageId` es único y nullable: la idempotencia de la ingesta ya existe y está cubierta por un test de integración.
- `sendOutboundMessage` en `src/core/messaging/outbound.ts` sólo implementa el modo `log`; cualquier otro valor de `WHATSAPP_TRANSPORT` registra el `Message` como `FAILED`. El hueco está marcado a propósito.
- El resumen tras confirmar ya se envía después del commit (D12 del bootstrap). El acuse automático no existe.
- La app corre en Railway detrás de un proxy que termina TLS: el proceso ve `http://` y un puerto interno, no la URL pública.

## Goals / Non-Goals

**Goals:**

- Un mensaje real de WhatsApp produce el mismo borrador que el simulador, sin tocar `src/core/` salvo el acuse.
- La verificación de firma no depende de cómo el proxy reescriba la petición.
- CI, tests y desarrollo local siguen funcionando sin credenciales ni red.
- Si Twilio falla o se queda sin configurar, el resto del sistema sigue igual que hoy.

**Non-Goals:**

- Abstraer el proveedor detrás de una interfaz genérica con varias implementaciones. Hay un proveedor real y un modo `log`; una tercera implementación justificaría la interfaz, no antes.
- Callbacks de estado de entrega (`StatusCallback`). `SENT` significa «Twilio aceptó el envío», no «el cliente lo leyó».
- Trabajo en segundo plano: el acuse se envía dentro de la misma petición del webhook.

## Decisions

### T1 — Twilio en lugar de Meta Cloud API (revierte D7 del bootstrap)

D7 eligió Meta porque firma con HMAC-SHA256 sobre el cuerpo crudo, mientras que Twilio firma con HMAC-SHA1 sobre la URL pública más los parámetros ordenados, y reconstruir esa URL detrás del proxy de Railway es una trampa conocida. **La decisión era correcta con la información de entonces y se revierte por tres hechos nuevos:** el autor ya tiene cuenta de Twilio y no tiene app de Meta (cuyo alta, con System User, es el paso más incierto del plan); el sandbox de Twilio admite a cualquier participante que envíe un código, así que un evaluador puede probar desde su teléfono, mientras que el número de prueba de Meta exige registrar y verificar por OTP cada destinatario; y el tiempo disponible es de horas, no de días.

*Alternativa considerada:* mantener Meta y conseguir la app. **Rechazada:** el riesgo está fuera del código y no se puede acotar con un timebox.

*Trade-off:* se hereda la trampa de la firma sobre la URL, que T2 neutraliza; se acepta el número compartido del sandbox y su caducidad por participante.

### T2 — La URL firmada es una variable, nunca una reconstrucción

`TWILIO_WEBHOOK_URL` contiene la URL exacta configurada en la consola de Twilio (`https://srs-carnik-production.up.railway.app/api/webhooks/twilio`). La firma se valida contra ese valor; `X-Forwarded-Proto`, `X-Forwarded-Host` y `req.url` se ignoran.

*Alternativa considerada:* reconstruir la URL desde las cabeceras de reenvío. **Rechazada:** depende de cómo configure el proxy un tercero, y una cabecera de reenvío la puede escribir quien envía la petición. Una variable fija convierte un problema de depuración en uno de configuración, con un síntoma inmediato (`403`) y una sola causa probable.

*Trade-off:* cambiar el dominio exige actualizar la variable y la consola de Twilio a la vez. Con un único entorno con canal real, es aceptable.

### T3 — SDK oficial `twilio` para firma y envío

`validateRequest(authToken, signature, url, params)` compara en tiempo constante y es la implementación de referencia del algoritmo; `getExpectedTwilioSignature` permite firmar los fixtures de los tests sin red. El envío usa `client.messages.create({ from, to, body })`.

*Alternativa considerada:* implementar el HMAC-SHA1 a mano y enviar con `fetch`. **Rechazada:** el algoritmo tiene detalles —orden de parámetros, URL con o sin puerto— donde una implementación propia falla en silencio, y la seguridad de la entrada no es el sitio para ahorrar una dependencia.

*Trade-off:* ~19 MB más en `node_modules`. Sólo se importa en el servidor y no afecta al bundle del cliente.

### T4 — Adaptador en `src/lib/twilio/`, ruta delgada

| Fichero | Responsabilidad |
|---|---|
| `src/app/api/webhooks/twilio/route.ts` | `POST`: lee `await req.formData()`, comprueba configuración, valida la firma, delega. Responde TwiML vacío (`<Response/>`, `text/xml`) |
| `src/lib/twilio/config.ts` | Lee y valida las cuatro variables; devuelve `null` si falta alguna |
| `src/lib/twilio/parse.ts` | Formulario → `InboundMessage` o `{ kind: "media" }` / `{ kind: "invalid" }`. Validación Zod en servidor del formulario ya autenticado |
| `src/lib/twilio/send.ts` | Envío con el SDK; `whatsapp:+E164` en ambos extremos |

`From` llega como `whatsapp:+41791234567`: se quita el prefijo y el resultado se valida contra el mismo patrón E.164 del simulador. Un remitente malformado se rechaza con `400` sin persistir nada.

### T5 — Respuesta síncrona, sin trabajo diferido

El webhook ingiere, redacta el borrador (LLM con timeout de 8 s y fallback) y envía el acuse antes de responder. Twilio espera hasta 15 s; el caso medido es de 2–3 s.

*Alternativa considerada:* responder `200` de inmediato y procesar después. **Rechazada:** exige trabajo en segundo plano, que D1 del bootstrap excluye, y la latencia medida no lo justifica. Si el LLM agota su timeout, el peor caso ronda los 9 s, todavía dentro del plazo.

*Trade-off:* si Twilio reintentara por timeout, la idempotencia por `MessageSid` evita duplicados.

### T6 — Acuse dentro del flujo de ingesta

Tras `createDraftOrder`, `ingestInboundMessage` llama a `sendOutboundMessage` con un texto fijo que **no** compromete precios ni disponibilidad, como exige el spec. Sólo se envía cuando se crea un borrador, no cuando el mensaje se suma a uno abierto: el cliente que añade algo no recibe un segundo acuse. Un fallo de envío no deshace el borrador.

**Ajuste durante la implementación:** con `WHATSAPP_TRANSPORT=twilio`, un borrador creado desde el simulador habría enviado el acuse por Twilio a un número inventado. El transporte real sólo se usa si el último mensaje entrante de la conversación llegó por WhatsApp; las conversaciones del simulador se registran con canal `SIMULATOR` y nunca salen a la red.

*Trade-off:* `ingest.ts` pasa a conocer el transporte saliente. Es el mismo módulo `core/messaging` que ya lo contiene; no introduce dependencia del proveedor.

### T7 — Adjuntos: registro sin contenido y respuesta pidiendo texto

Con `NumMedia > 0`, `MediaUrl0` no se lee. Se persiste un `Message` entrante con el cuerpo `[adjunto no procesado]` y se envía un mensaje pidiendo el pedido por escrito. No se crea borrador.

### T8 — Variables de entorno

| Variable | Uso | Dónde |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Identifica la cuenta | Railway |
| `TWILIO_AUTH_TOKEN` | Firma entrante y autenticación saliente. **Secreto** | Railway |
| `TWILIO_WHATSAPP_FROM` | Número del sandbox, `whatsapp:+14155238886` | Railway |
| `TWILIO_WEBHOOK_URL` | URL exacta configurada en Twilio (T2) | Railway |
| `WHATSAPP_TRANSPORT` | Pasa de `log` a `twilio` en producción | Railway |

CI y tests no reciben ninguna: el webhook se prueba con un token ficticio de test y fixtures firmados con `getExpectedTwilioSignature`, y el envío con `WHATSAPP_TRANSPORT=log` o con el SDK sustituido por un doble.

## Risks / Trade-offs

- [La firma no valida en producción aunque funcione en los tests] → El único insumo de entorno es `TWILIO_WEBHOOK_URL`: se copia literalmente desde la consola de Twilio. El primer mensaje real es parte de la verificación del PR, no un paso posterior.
- [El sandbox expira para un participante tras un tiempo sin actividad] → El README explica cómo volver a unirse con `join <código>`. El simulador sigue siendo el canal de evaluación de respaldo.
- [El resumen cae fuera de la ventana de 24 h] → El `Message` queda `FAILED` y el pedido sigue confirmado, como ya define el spec.
- [Endpoint público que dispara llamadas al LLM con coste] → Sólo procesa peticiones firmadas por Twilio, y al sandbox sólo escriben participantes unidos con el código. El límite por cliente (`US-03`) queda pendiente y se reabre si se usa un número propio.
- [El timebox de 3–4 h no alcanza] → El PR no se mergea y la entrega queda exactamente como está hoy. Nada de este change modifica el comportamiento con `WHATSAPP_TRANSPORT=log`.

## Migration Plan

1. Implementar y probar en local y CI sin credenciales.
2. Cargar las variables de T8 en Railway, con `WHATSAPP_TRANSPORT=log` todavía.
3. Desplegar. Configurar en la consola de Twilio *Sandbox settings → When a message comes in* con la URL de `TWILIO_WEBHOOK_URL`, método `POST`.
4. Enviar un mensaje desde un teléfono unido al sandbox y comprobar que aparece el borrador.
5. Cambiar `WHATSAPP_TRANSPORT=twilio` y comprobar que llegan el acuse y el resumen.

**Rollback:** `WHATSAPP_TRANSPORT=log` desactiva todo envío real sin redesplegar código; vaciar la URL en la consola de Twilio corta la entrada.

**Orden de archivo:** este change modifica `whatsapp-conversation`, que todavía vive como delta de `bootstrap-carnik`. `bootstrap-carnik` se archiva primero —recortando antes de su delta los Requirements no implementados— y este después.
