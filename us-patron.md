## US-EJ · Cerrar un deal de trading de energía eléctrica

**Como** trader de la empresa,  
**quiero** crear una oferta de compra o venta y solicitar el cierre del deal aceptado por una contraparte,
**para** realizar operaciones comerciales y generar un beneficio a partir de la diferencia de precios.

**Descripción**  
Desde la plataforma de ENMACC, el trader define mercado, zona de balance, contrapartes autorizadas, producto eléctrico, periodo de entrega, perfil de carga, volumen, precio y moneda. Esta historia define el contrato requerido de la integración; no presupone capacidades verificadas del proveedor.

Antes de publicar, revisa el resumen y confirma explícitamente. Una `Counterparty` autorizada acepta la oferta activa: se crea un `EnergyDeal` en estado `Aceptado`, se bloquean sus condiciones y la oferta deja de estar disponible. El trader solicita entonces el cierre: el deal pasa a `Pendiente de procesamiento` y solo pasa a `Cerrado` cuando el sistema interno confirma el procesamiento exitoso. No se admite aceptación parcial en esta historia.

### Permisos y transiciones

Se validan en servidor el rol, la empresa, los permisos del mercado y el acceso a la oferta en cada operación.

| Operación | trader propietario de la oferta | Counterparty autorizada | Transición y responsable |
|---|---|---|---|
| Crear | Sí | No | trader: nueva `TradeOffer` → `Borrador`, versión 1 |
| Publicar | Sí | No | trader solicita `Borrador/Modificada` → `Pendiente de publicación`; integración confirma → `Activa` |
| Modificar | Sí, antes de aceptación | No | trader: `Borrador/Activa` → `Modificada`, incrementa versión; exige republicación |
| Retirar | Sí, antes de aceptación | No | trader: `Activa/Modificada` → `Retirada`, incrementa versión |
| Aceptar | No, para su propia oferta | Sí | Counterparty: oferta `Activa` → `Aceptada`; crea `EnergyDeal` `Aceptado` |
| Cerrar | Sí, sobre deal aceptado | No | trader solicita `Aceptado` → `Pendiente de procesamiento`; integración confirma → `Cerrado` |

Durante publicación o cierre pendientes no se admiten cambios comerciales. Los rechazos definitivos de publicación devuelven la oferta a `Borrador/Modificada`; los timeouts conservan el estado pendiente hasta reconciliar. Un fallo de cierre conserva el deal pendiente con su error, sin desbloquear condiciones ni crear otro deal.

### Idempotencia y recepción durable

Toda publicación, aceptación y solicitud de cierre exige `Idempotency-Key` (UUID). Su ámbito es `(empresaId, actorId, operación, recursoId, clave)`, con unicidad persistida. La solicitud normalizada, su hash, actor, versión esperada y resultado original se guardan transaccionalmente junto a la mutación y, para integraciones, una fila outbox con identificador estable de operación. Misma clave y payload devuelve el resultado original (incluido el mismo identificador y acuse pendiente), sin repetir efectos; un endpoint de consulta por identificador permite conocer el estado actual. Misma clave y distinto payload devuelve `409 IDEMPOTENCY_KEY_REUSED`, sin efectos. Dos solicitudes concurrentes con la misma clave esperan la resolución de la primera.

La clave y resultado se retienen mientras la operación esté pendiente y durante 30 días desde su resolución terminal. Después se conserva una marca de clave consumida y hash durante la vida del recurso: un reintento devuelve `410 IDEMPOTENCY_KEY_EXPIRED` y nunca se trata como una operación nueva. Además, `EnergyDeal.offerId` es único y cada deal tiene una única operación de cierre, incluso con claves diferentes.

La respuesta en menos de 3 segundos significa **recepción durable**, con identificador y estado pendiente, no finalización de la integración. Sin commit no se emite ese acuse. Una desconexión del cliente se recupera repitiendo la misma clave. Un despachador recupera el outbox tras reinicio; reintenta errores transitorios a los 1, 5 y 30 segundos, luego cada 5 minutos hasta 24 horas; después requiere reintento manual autorizado con la misma operación y clave. Los errores permanentes requieren intervención. Se persisten contador, próximo intento y último error. El receptor deduplica por identificador estable de operación; si no ofrece deduplicación o consulta fiable para reconciliar un timeout ambiguo, se bloquea el reenvío automático hasta resolverlo. Un callback repetido no vuelve a cerrar ni a crear registros.

### Validaciones de mercado (Escenario 4)

Cada combinación habilitada `(marketId, currency, energyProductId)` exige un `MarketRuleSet` versionado con escalas decimales de precio/volumen/importe, modo de redondeo, unidades, mínimos y máximos inclusivos, pasos permitidos, zona IANA, granularidad y duración mínima/máxima de entrega. No hay reglas implícitas: una combinación ausente o incompleta se rechaza. Los valores siguientes son un **perfil sintético de pruebas**, no reglas reales de ENMACC; habilitar mercados reales requiere configurar sus reglas aprobadas.

| Campo | Perfil `TEST-POWER / EUR / BASE`, versión 1 |
|---|---|
| Precio | Decimal en EUR/MWh, escala máxima 2, mínimo -500,00, máximo 4000,00, paso 0,01 desde cero |
| Volumen | Decimal en MWh, escala máxima 3, mínimo 0,001, máximo 1000,000, paso 0,001 desde cero |
| Importe derivado | EUR, escala 2; precio × volumen exactos, redondeo `HALF_UP` una vez al final, empates alejándose de cero (±0,005 → ±0,01) |
| Entrega | Zona `Europe/Berlin`; instantes ISO 8601 con offset obligatorio consistente con la zona; intervalo `[inicio, fin)` |
| Límites temporales | Inicio estrictamente futuro al publicar y aceptar, inicio y fin en horas locales exactas; duración transcurrida mínima 1 h, máxima 8784 h, paso 1 h |

Reglas ejecutables compartidas por interfaz, API y sistema interno: parsear cadenas decimales exactas sin Float ni notación exponencial; comprobar escala, unidad, rango y `valor % paso == 0` antes de publicar/aceptar. Se rechaza precisión excedente, nunca se redondea la entrada para volverla válida. Para entrega, comprobar offset contra zona, rechazar horas inexistentes y exigir offset que desambigüe horas repetidas; comparar y restar instantes UTC, sin suponer que todos los días duran 24 h. Se rechazan `fin <= inicio`, granularidad o duración inválidas. Errores por campo, sin efectos. Persistir `ruleSetVersion` y el payload validado; todos los consumidores usan esa misma versión, sin reinterpretar datos con defaults. Si una versión queda deshabilitada, se rechaza y se exige revalidación/republicación antes de aceptar.

**Criterios de aceptación**

```gherkin
Escenario 1: Publicación, aceptación y cierre procesados correctamente (happy path)
  Dado un trader autorizado con una oferta válida según MarketRuleSet
  Cuando revisa y confirma publicación con Idempotency-Key y versión esperada
  Entonces se persisten solicitud y outbox y se devuelve el acuse durable en menos de 3 segundos
    Y la oferta queda "Pendiente de publicación" hasta confirmación externa exitosa
    Y pasa a "Activa" al recibir esa confirmación
  Cuando una Counterparty autorizada acepta con su Idempotency-Key y versión esperada
  Entonces una transacción valida estado activo, versión persistida y volumen completo disponible
    Y consume ese volumen, incrementa la versión y crea un único EnergyDeal "Aceptado"
    Y bloquea precio, volumen y condiciones con la versión de reglas aplicada
  Cuando el trader solicita el cierre con Idempotency-Key
  Entonces se persisten la solicitud y outbox y el deal queda "Pendiente de procesamiento"
    Y recibe identificador y acuse durable en menos de 3 segundos
    Y solo la confirmación exitosa del sistema interno lo marca "Cerrado"
    Y repetir cualquier clave con el mismo payload devuelve el resultado original sin duplicar efectos
    Y repetirla con otro payload devuelve 409 IDEMPOTENCY_KEY_REUSED

Escenario 2: Error de publicación o procesamiento
  Dado una solicitud persistida con su clave y outbox
  Cuando la integración falla o agota el tiempo de espera
  Entonces el deal no se marca "Cerrado" y se conserva la solicitud y su identificador
    Y se muestra el estado pendiente y el error sin perder los datos
    Y se aplican los reintentos automáticos o manuales definidos con la misma clave
    Y un resultado incierto exige reconciliación antes de un reenvío sin deduplicación
    Y la repetición devuelve el resultado original sin crear otra operación ni cerrar dos veces
    Y reutilizar la clave con otro payload se rechaza

Escenario 3: Oferta modificada o retirada antes de aceptación (edge case)
  Dado una TradeOffer activa con versión persistida v
  Cuando el trader modifica o retira usando versión esperada v
  Entonces una transacción bloquea la oferta y comprueba versión y ausencia de aceptación
    Y persiste versión v+1 y estado "Modificada" o "Retirada"
    Y registra actor, versión anterior/nueva y cambios
  Cuando una Counterparty intenta aceptar la versión v
  Entonces se rechaza con 409 STALE_OFFER_VERSION sin crear EnergyDeal
    Y incluso con versión actual una oferta no activa se rechaza
    Y si la aceptación ganó el bloqueo primero, la modificación/retirada se rechaza

Escenario 4: Datos incompletos o inválidos
  Dado una oferta y su MarketRuleSet versionado
  Cuando falta un campo, la combinación de mercado/moneda/producto no está habilitada
    O precio/volumen incumplen escala, unidad, rango o incremento
    O entrega incumple zona, offset, granularidad, duración u orden temporal
  Entonces interfaz, API y sistema interno aplican las mismas reglas y errores por campo
    Y no se publica ni acepta la oferta ni se redondean entradas inválidas
    Y se conservan los demás datos introducidos

Escenario 5: Aceptación simultánea por varias contrapartes
  Dado una oferta activa con volumen completo disponible y versión persistida v
  Cuando dos contrapartes intentan aceptar con versión esperada v e Idempotency-Key
  Entonces cada aceptación usa una transacción con bloqueo de TradeOffer
    Y compara estado activo, versión esperada y volumen disponible antes de crear EnergyDeal
    Y solo la primera válida consume el volumen y crea el deal "Aceptado"
    Y persiste oferta "Aceptada", versión v+1, auditoría y resultado idempotente en el mismo commit
    Y las otras claves reciben conflicto sin crear deal ni consumir volumen
    Y repetir la clave ganadora devuelve su resultado original
    Y ningún deal queda "Cerrado" hasta solicitud del trader y confirmación interna exitosa
```

**Notas no funcionales**

- Publicación, aceptación y cierre aplican exactamente el ámbito, retención y manejo de payload de la sección de idempotencia, también en el escenario 5 y en reintentos manuales.
- `TradeOffer.version` se persiste e incrementa en cada transición; todas las mutaciones comparan la versión esperada bajo el mismo bloqueo transaccional. La restricción única de `EnergyDeal.offerId` protege también frente a claves distintas.
- La auditoría registra actor/rol, contraparte, instante UTC, operación, clave, dirección, estado y versión anterior/nueva, versión esperada, ruleSetVersion y resultado/conflicto. Los conflictos se auditan sin persistir mutaciones comerciales fallidas.
- Las condiciones del deal son inmutables desde la aceptación. La recepción durable se mide independientemente del tiempo externo de procesamiento.

**Trazabilidad y pruebas técnicas:** Función «Negociación y cierre de deals de energía» · `TradeOffer`, `EnergyDeal`, `Trader`, `Counterparty`, `EnergyProduct`, `MarketRuleSet`, `AuditLog`, registro de idempotencia y outbox. Verificar matriz de permisos; replay idéntico/distinto, concurrencia, retención a 30 días y marca expirada; reinicio tras commit y callbacks duplicados; aceptación contra modificación/retirada con dos transacciones y versión obsoleta; volumen insuficiente sin efectos; cierre solo tras éxito interno. Para cada perfil habilitado, ejecutar los mismos vectores en UI/API/sistema interno: extremos inclusivos y fuera de rango, pasos y escalas inválidos, empate ±0,005, combinación no habilitada, hora inexistente/repetida y duración UTC durante cambio horario. No habilitar un perfil cuyos vectores difieran entre consumidores.

**Dependencias:** integración con ENMACC · autenticación y RBAC · catálogo versionado de productos y mercados · servicio de contrapartes · integración con PMS o sistema de gestión de portfolio con deduplicación/reconciliación · servicio de notificaciones

**Estimación:** 8 SP (reestimar con el contrato de integración y perfiles reales).

**INVEST**

- **I — Independiente:** flujo delimitado, con dependencias de integración y configuración explícitas.
- **N — Negociable:** visibilidad y perfiles de mercado; aceptación parcial queda fuera de esta historia.
- **V — Valiosa:** registra operaciones comerciales sin duplicar deals.
- **E — Estimable:** requiere conocer capacidades de integración y reglas reales antes de estimar su implementación final.
- **S — Pequeña:** limita el flujo a aceptación completa; negociación por chat y productos complejos quedan fuera.
- **T — Testeable:** estados, versiones, auditoría, outbox y vectores de validación permiten comprobar cada transición.
