# Tasks — Canal de WhatsApp real vía Twilio

**Timebox: 3–4 h el lunes 2026-10-05**, en la rama `feature-whatsapp-twilio-FJW` y un PR propio. Se mergea sólo si llega con CI en verde **y** un mensaje real recibido en producción. Si no, se deja abierto y la entrega queda con el simulador, sin nada que deshacer.

| Grupo | Tareas | Estimación |
|---|---:|---:|
| 0 · Preparación en Twilio (autor) | 1 | 0,25 |
| 1 · Adaptador de entrada | 3 | 1,25 |
| 2 · Transporte saliente y acuse | 2 | 0,75 |
| 3 · Tests | 2 | 0,75 |
| 4 · Despliegue y primer mensaje real | 2 | 0,5 |
| 5 · Documentación | 1 | 0,5 |
| **Total** | **11** | **~4 h** |

**Regla de control:** si a las 2 h el webhook no valida un payload firmado en los tests, se para y se documenta como pendiente.

## 0. Preparación en Twilio (autor, en paralelo con el grupo 1)

- [x] 0.1 En la consola de Twilio: unirse al sandbox de WhatsApp desde el teléfono propio (`join <código>` al +1 415 523 8886) y anotar Account SID, Auth Token y el código de unión. Toca: nada en el repositorio.

## 1. Adaptador de entrada

- [x] 1.1 Instalar `twilio@6`; crear `src/lib/twilio/config.ts`, que lee `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` y `TWILIO_WEBHOOK_URL` y devuelve `null` si falta alguna; añadirlas a `env.example`. Toca `package.json`, `package-lock.json`, `src/lib/twilio/config.ts`, `env.example`
- [x] 1.2 `src/lib/twilio/parse.ts`: formulario de Twilio → `InboundMessage` con `channel: "WHATSAPP"`, `providerMessageId = MessageSid`, `From` sin el prefijo `whatsapp:` y validado como E.164 con Zod; devuelve `media` si `NumMedia > 0` e `invalid` si falta remitente o identificador. Toca `src/lib/twilio/parse.ts`, `src/lib/validation/messaging.ts`
- [x] 1.3 `POST /api/webhooks/twilio`: `formData()` → `403` sin configuración (fallo cerrado) → `validateRequest` contra `TWILIO_WEBHOOK_URL`, `403` si no valida → parseo, `400` si es inválido → con adjunto, registro sin contenido y respuesta pidiendo texto → si no, `ingestInboundMessage`. Responde `<Response/>` como `text/xml`. Los rechazos se registran sin cuerpo ni número. Toca `src/app/api/webhooks/twilio/route.ts`

## 2. Transporte saliente y acuse

- [x] 2.1 `src/lib/twilio/send.ts` con `client.messages.create`; en `sendOutboundMessage`, modo `twilio` que envía a `whatsapp:<phoneE164>` del cliente de la conversación y registra `SENT` o `FAILED` (sin propagar el error); `channel` del `Message` saliente según el modo. Toca `src/lib/twilio/send.ts`, `src/core/messaging/outbound.ts`
- [x] 2.2 Acuse automático tras `createDraftOrder` en `ingestInboundMessage`, sólo cuando se crea un borrador, con texto que no menciona precios ni disponibilidad; respuesta al adjunto pidiendo texto. Toca `src/core/messaging/ingest.ts`, `src/core/messaging/outbound.ts`

## 3. Tests

- [x] 3.1 Unitarios del parser: texto válido, `From` sin prefijo o malformado, `NumMedia > 0`, falta de `MessageSid`. Toca `tests/unit/twilio-parse.test.ts`
- [x] 3.2 Integración del webhook con fixtures firmados por `getExpectedTwilioSignature` y un token de test: firma válida → `Message` y `Order` creados y acuse registrado; firma inválida → `403` sin escrituras; firma para otra URL con `X-Forwarded-Host` manipulado → `403`; sin configuración → `403`; reintento del mismo `MessageSid` → sin duplicados; adjunto → sin `Order` y respuesta pidiendo texto. Transporte en `log`. Toca `tests/integration/twilio-webhook.test.ts`, `tests/test.env`

## 4. Despliegue y primer mensaje real

- [x] 4.1 Variables de Railway (`TWILIO_*`, todavía `WHATSAPP_TRANSPORT=log`), despliegue y alta de la URL en *Sandbox settings → When a message comes in*; enviar un mensaje desde el teléfono y comprobar el borrador en el backoffice. Toca: Railway y consola de Twilio
- [ ] 4.2 `WHATSAPP_TRANSPORT=twilio`; comprobar que llegan el acuse y, tras confirmar, el resumen. Grabar el video de 2–3 minutos del flujo real. Toca: Railway *(Técnicamente hecho: acuse y resumen llegan al teléfono. Queda pendiente sólo el video, a cargo del autor.)*

## 5. Documentación

- [x] 5.1 Nota de reversión en D7 de `openspec/changes/bootstrap-carnik/design.md` apuntando a T1; README §0 (alcance), §1.3 (cómo unirse al sandbox y probar desde el teléfono), §2.4 (variables y estado) y §7 (PR); entrada en `prompts.md` sobre el cambio de proveedor como decisión humana. Toca `readme.md`, `prompts.md`, `openspec/changes/bootstrap-carnik/design.md`
