## Why

Carnik funciona de punta a punta, pero su único canal de entrada es un simulador: la premisa del producto —el cliente escribe por WhatsApp como siempre— todavía no se puede demostrar. La integración con Meta Cloud API, prevista en la Entrega 1, exige crear desde cero una app de desarrollador y un System User; el autor ya tiene una cuenta de prueba en Twilio, que se conecta en minutos y permite que cualquier evaluador se una al sandbox con un código.

## What Changes

- **Webhook entrante de Twilio** (`POST /api/webhooks/twilio`): valida la firma `X-Twilio-Signature` contra una URL pública fija y configurada, traduce el formulario de Twilio a `InboundMessage` y lo entrega a la ingesta existente. El núcleo de dominio no cambia.
- **Fallo cerrado:** sin credenciales de Twilio configuradas, el webhook rechaza toda petición.
- **Adjuntos:** un mensaje con foto o nota de voz no se descarga; queda registrado sin contenido y el cliente recibe un pedido de que escriba en texto.
- **Transporte saliente `twilio`** junto al `log` existente: los mensajes al cliente se envían por la API de Twilio y se registran como `SENT` o `FAILED`.
- **Acuse automático** al crearse un borrador, que había quedado fuera de la entrega anterior. El resumen al confirmar pasa a llegar de verdad al teléfono del cliente.
- **Reversión de una decisión de diseño:** Meta se había elegido sobre Twilio por la firma sobre el cuerpo crudo. La decisión se revierte y se documenta el motivo.

### Impacto visible para el usuario

- **Cliente:** escribe al número del sandbox de Twilio desde su WhatsApp, recibe al instante un acuse —«recibimos tu pedido»— y, al confirmarse, el resumen con las líneas y el total. Antes no recibía nada: el canal era simulado.
- **Empleado:** sin cambios en su pantalla. Los pedidos reales aparecen en el mismo listado que los simulados, y la conversación muestra si cada mensaje saliente se entregó o falló.
- **Evaluador:** puede probar el flujo desde su propio teléfono uniéndose al sandbox con el código `join`, sin que el autor tenga que registrar su número.

### Fuera de alcance

- **Meta Cloud API.** No se implementa ni se mantiene en paralelo; el tipo de canal sigue siendo `WHATSAPP`, sin distinguir proveedor.
- **Plantillas para escribir fuera de la ventana de 24 h.** Un resumen que cae fuera de la ventana falla de forma controlada, como ya preveía el spec.
- **Número propio de WhatsApp Business.** Se usa el número compartido del sandbox, grado-demo.
- **Mensaje manual del empleado (`US-12`), ajuste de líneas y cola de armado.** Siguen pendientes; este cambio sólo conecta el canal.
- **Límite de mensajes por cliente (`US-03`).** El sandbox sólo admite participantes que se unieron con el código, lo que acota el abuso para una demo; con un número propio volvería a ser necesario.
- **Varios mensajes por petición.** Twilio entrega un mensaje por petición, así que el escenario de lote del spec no aplica a este proveedor.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `whatsapp-conversation`: la recepción autenticada deja de exigir una firma calculada sobre el cuerpo exacto —el esquema de Meta— y pasa a exigir la validación de la firma del proveedor sobre la petición tal como el proveedor la firmó, contra una URL pública configurada, con fallo cerrado si faltan credenciales.

## Impact

- **Código nuevo:** `src/app/api/webhooks/twilio/route.ts` y un adaptador `src/lib/twilio/` (firma, parseo, envío). Modificaciones acotadas en `src/core/messaging/outbound.ts` (nuevo modo de transporte) y `src/core/messaging/ingest.ts` (acuse tras crear el borrador).
- **Dependencia:** SDK oficial `twilio` para validar la firma y enviar mensajes.
- **Configuración:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_URL` y `WHATSAPP_TRANSPORT=twilio` en Railway. CI sigue sin credenciales reales.
- **Datos:** sin migraciones. `providerMessageId` guarda el `MessageSid` de Twilio y su índice único da la idempotencia.
- **Documentación:** `design.md` del bootstrap (D7 y D18), README §2.4 y §1.3, y `prompts.md`.
- **Presupuesto:** timebox de 3–4 h el lunes 2026-10-05, en un PR separado que sólo se mergea si llega con CI en verde y un mensaje real recibido. Si no, la entrega se queda con el simulador, que sigue siendo el canal de respaldo.
