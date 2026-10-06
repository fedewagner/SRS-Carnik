# Seguridad

El análisis completo —autenticación, autorización, validación, protección de datos y tabla de riesgos— está en el [README, §2.5](readme.md#25-seguridad). Este fichero recoge lo operativo.

## Cómo reportar una vulnerabilidad

No abras un issue público. Escribí a la persona responsable del repositorio con la descripción, los pasos para reproducirla y el impacto que estimás. Se responde en un plazo de 72 h.

## Riesgos aceptados y pendientes

| Riesgo | Estado |
|---|---|
| Sin retención, purga ni derecho de supresión (nLPD) | Pendiente: deuda declarada |
| Sin DPA con Twilio ni con el proveedor de AI | Pendiente: deuda declarada |
| Volcado de base expone teléfonos y conversaciones (sin cifrado por campo) | Pendiente |
| Fuerza bruta contra `/login`: límite por cuenta en memoria, sin límite por IP | Parcial |
| Sesión robada: TTL de 8 h y rotación de `SESSION_SECRET`, sin revocación individual | Parcial |
| CSP con `'unsafe-inline'`, sin nonce | Parcial |

## Rotación de secretos

El procedimiento por variable está en el [README, «Si un secreto se filtra»](readme.md#si-un-secreto-se-filtra). Rotar `SESSION_SECRET` cierra todas las sesiones abiertas.

## Registro de incidentes

| Fecha | Qué pasó | Secretos rotados | Acciones |
|---|---|---|---|
| — | Sin incidentes registrados | — | — |
