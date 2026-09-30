## US-EJ · Cerrar un deal de trading de energía eléctrica

**Como** trader de la empresa,  
**quiero** crear y cerrar una oferta de compra o venta de energía eléctrica,  
**para** realizar operaciones comerciales y generar un beneficio a partir de la diferencia de precios.

**Descripción**  
Desde la plataforma de ENMACC, el trader accede a la sección de negociación y selecciona si desea comprar o vender energía eléctrica. El sistema le permite definir los parámetros de la oferta, como mercado, zona de balance, contraparte, producto eléctrico, periodo de entrega, perfil de carga, volumen, precio y moneda.

Antes de publicar la oferta, el sistema muestra un resumen de todos los datos introducidos y solicita una confirmación explícita. Una vez publicada, la oferta queda disponible para las contrapartes autorizadas. Cuando una `Counterparty` autorizada acepta la oferta, se crea un `EnergyDeal` en estado «Aceptado» y se bloquean sus condiciones comerciales. El `trader` solicita su cierre: el deal pasa a «Pendiente de procesamiento» y sólo queda «Cerrado» cuando el sistema interno confirma el procesamiento exitoso de esa solicitud.

### Permisos y transiciones

Todas las operaciones validan en servidor el rol, los permisos del mercado y la relación del actor con la oferta; no basta ocultar botones.

| Operación | trader propietario con permiso del mercado | Counterparty destinataria autorizada | Transición / responsable |
|---|---|---|---|
| Crear | Sí | No | trader: nueva `TradeOffer` → Borrador |
| Publicar | Sí | No | trader: Borrador → Pendiente de publicación; integración exitosa → Activa |
| Modificar | Sí, antes de aceptación | No | trader: incrementa versión y deja la nueva versión pendiente de publicación; invalida la anterior |
| Retirar | Sí, antes de aceptación | No | trader: Activa/Pendiente de publicación → Retirada, incrementando versión y bloqueando aceptación local inmediatamente |
| Aceptar | No | Sí, sobre oferta Activa dirigida a ella | Counterparty: aceptación atómica → oferta Aceptada y `EnergyDeal` Aceptado |
| Cerrar | Sí, sobre deal Aceptado | No | trader: solicita cierre → Pendiente de procesamiento; confirmación exitosa correlacionada de integración → Cerrado |

Una modificación o retirada ya aceptada SHALL rechazarse. La confirmación de integración ejecuta la solicitud del trader y no otorga permiso de cierre a la contraparte. Esta historia cubre aceptación total; la aceptación parcial queda fuera de alcance.

### Solicitudes durables e idempotencia

Publicar, aceptar y solicitar cierre exigen `Idempotency-Key` (UUID generado por el cliente una vez por intención y conservado para todos sus reintentos). El ámbito único es `(organizationId, operation, resourceId, key)`, donde `resourceId` es la oferta para publicación/aceptación y el deal para cierre; `operation` distingue las tres acciones. La autorización del actor se comprueba incluso al repetir la clave.

Se persisten clave, hash canónico del payload (incluye versión esperada), actor, identificador de operación y respuesta original en la misma transacción que el cambio local y la solicitud de integración/outbox. Repetir clave y payload devuelve el mismo identificador y respuesta original sin repetir efectos; una clave con payload diferente devuelve `409 IDEMPOTENCY_KEY_REUSED`. Una repetición concurrente espera el resultado de la primera transacción. El progreso posterior se consulta por el identificador de operación, sin sustituir la respuesta original de recepción.

El registro y su respuesta se conservan durante toda la vida de la oferta/deal y al menos 30 días después de su estado terminal. Tras ese plazo, una clave retirada conserva un tombstone (ámbito, clave y hash) y se rechaza con `409 IDEMPOTENCY_KEY_EXPIRED`; nunca se interpreta como nueva. `EnergyDeal.tradeOfferId` es único y una solicitud de cierre por deal es única aunque se use otra clave. La integración reutiliza el identificador de operación como clave externa; callbacks duplicados o fuera de orden no repiten transiciones.

Publicación y cierre responden en menos de 3 segundos con `202`, identificador y estado pendiente **sólo después del commit durable**; esto acredita recepción, no finalización externa. Si no se logra persistir, no se responde éxito. El outbox permite recuperar tras reinicios. Reintentos automáticos de errores transitorios: 1 s, 5 s, 30 s, 2 min y 10 min; agotados, se requiere reintento manual autorizado sobre la misma solicitud y clave. Errores permanentes requieren corrección explícita. Un timeout ambiguo se reconcilia por identificador antes de reenviar; si el proveedor no ofrece deduplicación ni consulta de resultado, se bloquea el reenvío y se deriva a revisión, sin afirmar cierre ni crear otra operación.

### Reglas de validación de mercado

Cada combinación habilitada `(marketId, currency, energyProductId)` requiere un perfil versionado aprobado en el catálogo. Sin perfil completo o con moneda no admitida, la API rechaza la publicación. UI, API e integración interna usan la misma versión del perfil; `TradeOffer` y `EnergyDeal` conservan su identificador y versión. No hay reglas implícitas basadas en el formato regional del navegador.

El perfil exige: moneda; unidad de precio y volumen; escalas decimales; `roundingMode`; mínimos y máximos inclusivos; incrementos y su origen; zona IANA de entrega; paso temporal y duraciones mínima/máxima. Validación con Decimal exacto: `min <= value <= max` y `(value - incrementOrigin) % increment == 0`; se rechaza precisión mayor que la escala sin redondear entradas inválidas. Para importes derivados se usa `ROUND_HALF_UP` a la escala monetaria del perfil al finalizar cada importe, nunca float.

**Perfil ejecutable exclusivamente de prueba, no reglas de un mercado real:**

| Perfil / moneda | Precio | Volumen | Importe derivado | Entrega |
|---|---|---|---|---|
| `TEST-POWER/EUR/BASE/v1` | EUR/MWh; escala 2; mínimo 0,00; máximo 1000,00; paso 0,01; origen 0 | MWh; escala 3; mínimo 0,001; máximo 1000,000; paso 0,001; origen 0 | EUR, escala 2, `ROUND_HALF_UP` para `precio × volumen` | `Etc/UTC`; inicio/fin con offset UTC explícito y alineados a 15 min; `inicio < fin`; duración 15 min a 24 h inclusive |

El perfil de prueba es la única combinación admitida en fixtures. Los mercados reales quedan deshabilitados hasta cargar sus perfiles aprobados: aquí no se presuponen límites comerciales reales. Para cualquier perfil, se rechazan zonas/offsets incongruentes, horas locales inexistentes o ambiguas sin offset explícito, segundos fuera de la rejilla y periodos fuera de los límites. Los instantes se persisten en UTC junto a zona y versión del perfil; la duración se calcula entre instantes. La API devuelve `422` con campo y regla incumplida, y la integración rechaza valores no conformes con la misma versión.

**Criterios de aceptación**

```gherkin
Escenario 1: Deal cerrado correctamente (happy path)
  Dado que soy un trader autenticado con permisos para operar
    Y he seleccionado una operación de compra o venta
    Y he completado todos los campos obligatorios de la oferta
  Cuando confirmo la publicación con Idempotency-Key y versión esperada
  Entonces persiste la solicitud y el outbox y devuelve 202 en menos de 3 segundos
    Y repetir esa clave y payload devuelve la respuesta original sin duplicar publicación
    Y reutilizarla con otro payload devuelve 409 IDEMPOTENCY_KEY_REUSED
    Y sólo la confirmación de publicación de la integración activa la oferta
  Cuando una Counterparty autorizada acepta la oferta con su Idempotency-Key y versión esperada
  Entonces crea atómicamente un EnergyDeal "Aceptado" y bloquea sus condiciones
    Y una repetición de esa clave devuelve el resultado original sin crear otro deal
  Cuando el trader solicita el cierre con Idempotency-Key
  Entonces persiste la solicitud, registra compra o venta y marca "Pendiente de procesamiento"
    Y devuelve 202 con identificador en menos de 3 segundos como recepción durable
  Cuando el sistema interno confirma exitosamente esa misma operación
  Entonces el deal pasa a "Cerrado" y se muestra su resumen definitivo
    Y una confirmación externa repetida no vuelve a cerrarlo

Escenario 2: Error al publicar o procesar la oferta
  Dado que soy un trader autenticado con permisos para operar
    Y he completado correctamente todos los campos obligatorios
  Cuando solicito publicar o cerrar y la solicitud ya quedó persistida
    Y ENMACC o la integración devuelve un error o agota el tiempo de espera
  Entonces la publicación permanece pendiente o el deal sigue "Pendiente de procesamiento"
    Y el deal no se marca "Cerrado" ni se pierde la solicitud tras un reinicio
    Y se aplican los reintentos automáticos y manuales definidos en "Solicitudes durables e idempotencia"
    Y todo reintento conserva el ámbito, clave y payload originales y no duplica operaciones
    Y un resultado ambiguo exige reconciliación antes de reenviar
    Y la información y el error quedan disponibles para revisión técnica

Escenario 3: Oferta modificada o retirada antes de su aceptación (edge case)
  Dado que he publicado una oferta que todavía no fue aceptada
  Cuando modifico el precio o retiro la oferta
  Entonces una transacción incrementa la versión persistida de TradeOffer e invalida la anterior
    Y la nueva versión queda pendiente de publicación o la oferta queda "Retirada"
    Y aceptar exige estado "Activa", versión esperada igual a la persistida y volumen total disponible
    Y una aceptación con versión obsoleta o estado modificado/retirado devuelve 409 sin crear EnergyDeal
    Y modificar, retirar y aceptar compiten sobre la misma fila bloqueada y versión
    Y si la aceptación ganó primero, la modificación o retirada se rechaza
    Y la auditoría registra actor, versión esperada/actual, estado y resultado

Escenario 4: Datos obligatorios incompletos o inválidos
  Dado que estoy creando una oferta de compra o venta
  Cuando intento publicarla sin completar un campo obligatorio
    O incumplo las escalas, límites, incrementos, moneda, unidades o zona/periodo del perfil de mercado versionado
  Entonces el sistema no publica la oferta
    Y destaca los campos que deben corregirse
    Y muestra un mensaje indicando el motivo de la validación
    Y conserva los demás datos introducidos
    Y la API devuelve 422 con la regla incumplida y el sistema interno aplica el mismo perfil
    Y no se redondean entradas inválidas para hacerlas válidas

Escenario 5: Aceptación simultánea por varias contrapartes
  Dado que una oferta está activa y disponible para varias contrapartes
  Cuando dos contrapartes intentan aceptarla simultáneamente
  Entonces una única transacción valida estado Activa, versión esperada y volumen disponible
    Y sólo la primera aceptación válida reserva todo el volumen y crea EnergyDeal "Aceptado"
    Y actualiza estado y versión de TradeOffer y registra la auditoría en la misma transacción
    Y cualquier fallo revierte reserva, deal y auditoría juntos
    Y las otras aceptaciones con claves distintas reciben 409 sin crear deals
    Y repetir la clave ganadora y su payload devuelve el resultado original según la política de retención
    Y repetir esa clave con payload distinto devuelve 409 IDEMPOTENCY_KEY_REUSED
    Y el deal sólo podrá cerrarse mediante solicitud posterior del trader y éxito de integración
```

**Notas no funcionales**

- Publicación, aceptación y solicitud de cierre aplican la clave, ámbito, retención y respuestas definidos en «Solicitudes durables e idempotencia», incluidos los reintentos del escenario 5.
    
- Crear, publicar, modificar, retirar y solicitar cierre corresponden al `trader`; aceptar corresponde exclusivamente a `Counterparty`, según la matriz de permisos.
    
- Las validaciones del perfil versionado se ejecutan en UI, API e integración interna antes de publicar; el servidor es autoritativo.
    
- Una vez cerrado el deal, sus condiciones comerciales no pueden modificarse directamente.
    
- Debe mantenerse un registro de auditoría con actor, contraparte, fecha y hora, dirección de la operación, valores anteriores y nuevos, e identificador de la transacción.
    
- La respuesta en menos de 3 segundos confirma recepción durable de publicación/cierre; la finalización externa se muestra por separado y nunca se deduce de un timeout.
    
- Precio, volumen y entrega siguen las escalas, redondeo, unidades, límites, pasos y zona del perfil aprobado; las entradas no conformes se rechazan.
    

**Trazabilidad:** Función «Negociación y cierre de deals de energía» · Entidades  
`TradeOffer` (versión persistida, estado, volumen disponible, perfil de reglas), `EnergyDeal` (`tradeOfferId` único, estado y condiciones bloqueadas), `Trader`, `Counterparty`, `EnergyProduct`, `Market` (perfiles versionados), `AuditLog`, solicitud/outbox e idempotencia persistentes.

**Pruebas técnicas:**

- RBAC de las seis operaciones: el trader no acepta y la contraparte no cierra; validación de mercado y destinatario.
- Dos aceptaciones concurrentes con misma versión y claves distintas: un solo deal y una sola reserva; versión obsoleta, modificación o retirada ganadora: 409 sin efectos; rollback ante fallo de creación del deal.
- Publicación, aceptación y cierre: clave repetida con mismo payload devuelve respuesta original, payload distinto da 409, retención y tombstones impiden reutilización; nueva clave no duplica deal ni cierre.
- Reinicio después del commit y antes del envío, timeout tras aceptación externa, callbacks repetidos y reintentos agotados: solicitud conservada y sin cierre hasta éxito correlacionado.
- Perfil `TEST-POWER/EUR/BASE/v1`: límites inclusivos 0/1000 EUR por MWh y 0,001/1000 MWh válidos; precio -0,01 o 1000,01 y volumen 0 o 1000,001 inválidos; 1,001 EUR por MWh y 0,0005 MWh rechazados por precisión; 1,50 × 0,003 = 0,0045 → 0,00 EUR y 1,50 × 0,010 = 0,015 → 0,02 EUR con `ROUND_HALF_UP`.
- Entrega UTC de 15 min y 24 h válida; 14 min, 24 h 15 min, inicio ≥ fin, offset incongruente, moneda/perfil desconocidos rechazados de modo idéntico en UI, API e integración. Fixtures de perfiles con horario estacional cubren horas inexistentes y ambiguas.

**Dependencias:** integración con ENMACC · autenticación y RBAC · catálogo de productos y mercados · servicio de contrapartes · integración con PMS o sistema de gestión de portfolio · servicio de notificaciones

**Estimación:** 8 SP

**INVEST**

- **I — Independiente:** puede implementarse como un flujo de creación y cierre de ofertas, aunque requiere que las integraciones técnicas estén disponibles.
    
- **N — Negociable:** las reglas sobre modificación, retirada, aceptación parcial y visibilidad de las ofertas pueden acordarse con negocio.
    
- **V — Valiosa:** permite ejecutar la actividad principal de trading y registrar operaciones que generan ingresos para la empresa.
    
- **E — Estimable:** el flujo, las validaciones y los principales puntos de integración están claramente identificados.
    
- **S — Pequeña:** cubre una operación básica de compra o venta; funcionalidades como negociación por chat, ofertas parciales o productos complejos pueden separarse en otras historias.
    
- **T — Testeable:** puede verificarse mediante el estado del deal, el identificador generado, los datos enviados al sistema interno, el registro de auditoría y la ausencia de operaciones duplicadas.
-
