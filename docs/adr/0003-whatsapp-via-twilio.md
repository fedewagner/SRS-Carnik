# ADR 0003 · WhatsApp vía Twilio Sandbox

**Estado:** aceptada · 2026-10-04 · reemplaza la decisión D7 de la Entrega 1 (Meta Cloud API)

## Contexto

La Entrega 1 eligió Meta Cloud API porque firma el cuerpo crudo, mientras que Twilio firma sobre la URL pública, que detrás del proxy de Railway no coincide con la que ve el proceso. Al llegar a la implementación cambiaron tres hechos:

1. Había cuenta de Twilio y no app de Meta, cuyo alta era el paso más incierto.
2. El sandbox de Twilio admite a cualquiera que envíe `join <código>`, así que un evaluador puede probar desde su teléfono; el número de prueba de Meta exige verificar cada destinatario.
3. El tiempo disponible era de horas.

## Decisión

Twilio WhatsApp Sandbox. La firma se valida con `twilio.validateRequest` contra la variable fija `TWILIO_WEBHOOK_URL`, nunca reconstruyendo la URL desde `X-Forwarded-*`. El webhook falla cerrado si faltan credenciales.

## Consecuencias

- El cambio sólo tocó `src/lib/twilio/` y la ruta `/api/webhooks/twilio`; el núcleo no cambió (ADR 0001).
- Un test comprueba que la firma sigue siendo válida con cabeceras `X-Forwarded-*` manipuladas.
- Si producción devuelve 403, la causa casi segura es `TWILIO_WEBHOOK_URL`.
- Para un cliente real, Twilio exige dar de baja la cuenta de WhatsApp del número; la coexistencia con la app del móvil no está disponible. Queda como pregunta de producto abierta.

Change: `openspec/changes/archive/2026-10-06-add-whatsapp-twilio-channel/` (decisiones T1 y T2).
