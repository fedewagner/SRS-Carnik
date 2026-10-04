## US-EJ · Cerrar un deal de trading de energía eléctrica

**Como** trader de la empresa,  
**quiero** crear y cerrar una oferta de compra o venta de energía eléctrica,  
**para** realizar operaciones comerciales y generar un beneficio a partir de la diferencia de precios.

**Descripción**  
Desde la plataforma de ENMACC, el trader accede a la sección de negociación y selecciona si desea comprar o vender energía eléctrica. El sistema le permite definir los parámetros de la oferta, como mercado, zona de balance, contraparte, producto eléctrico, periodo de entrega, perfil de carga, volumen, precio y moneda.

Antes de publicar la oferta, el sistema muestra un resumen de todos los datos introducidos y solicita una confirmación explícita. Una vez publicada, la oferta queda disponible para las contrapartes autorizadas. Cuando una contraparte la acepta, el deal se considera cerrado, se bloquean sus condiciones comerciales y se genera el registro correspondiente para su posterior procesamiento en los sistemas internos.

**Criterios de aceptación**

```gherkin
Escenario 1: Deal cerrado correctamente (happy path)
  Dado que soy un trader autenticado con permisos para operar
    Y he seleccionado una operación de compra o venta
    Y he completado todos los campos obligatorios de la oferta
  Cuando reviso los datos, confirmo y una contraparte autorizada acepta la oferta
  Entonces el sistema marca el deal como "Cerrado"
    Y asigna un identificador único a la operación
    Y registra la dirección de la operación como compra o venta
    Y bloquea el precio, volumen y demás condiciones acordadas
    Y muestra una confirmación con el resumen del deal
    Y envía el deal cerrado al sistema interno de procesamiento

Escenario 2: Error al publicar o procesar la oferta
  Dado que soy un trader autenticado con permisos para operar
    Y he completado correctamente todos los campos obligatorios
  Cuando confirmo la publicación de la oferta
    Y ENMACC o el sistema de integración devuelve un error o agota el tiempo de espera
  Entonces el deal no se marca como "Cerrado"
    Y no se genera una operación duplicada
    Y la información introducida permanece disponible para su revisión
    Y se muestra un mensaje accionable con la opción de reintentar
    Y el error queda registrado para su análisis técnico

Escenario 3: Oferta modificada o retirada antes de su aceptación (edge case)
  Dado que he publicado una oferta que todavía no fue aceptada
  Cuando modifico el precio o retiro la oferta
  Entonces la versión anterior deja de estar disponible para nuevas aceptaciones
    Y el sistema registra la modificación o retirada
    Y ninguna contraparte puede cerrar el deal utilizando las condiciones anteriores
    Y la oferta mantiene el estado "Modificada" o "Retirada", según corresponda

Escenario 4: Datos obligatorios incompletos o inválidos
  Dado que estoy creando una oferta de compra o venta
  Cuando intento publicarla sin completar un campo obligatorio
    O introduzco un precio, volumen o periodo de entrega inválido
  Entonces el sistema no publica la oferta
    Y destaca los campos que deben corregirse
    Y muestra un mensaje indicando el motivo de la validación
    Y conserva los demás datos introducidos

Escenario 5: Aceptación simultánea por varias contrapartes
  Dado que una oferta está activa y disponible para varias contrapartes
  Cuando dos contrapartes intentan aceptarla simultáneamente
  Entonces solo la primera aceptación válida cierra el deal
    Y las aceptaciones posteriores son rechazadas
    Y el volumen negociado no supera el volumen disponible
    Y el sistema informa a las demás contrapartes que la oferta ya no está disponible

**Notas no funcionales**

- La operación de publicación y cierre debe ser idempotente: un doble clic o reintento no puede generar deals duplicados.
    
- Solo los usuarios con el rol `trader` y los permisos correspondientes al mercado pueden crear o cerrar operaciones.
    
- Las validaciones de precio, volumen, moneda, producto y periodo de entrega deben ejecutarse antes de publicar la oferta.
    
- Una vez cerrado el deal, sus condiciones comerciales no pueden modificarse directamente.
    
- Debe mantenerse un registro de auditoría con actor, contraparte, fecha y hora, dirección de la operación, valores anteriores y nuevos, e identificador de la transacción.
    
- La confirmación del cierre debe mostrarse al usuario en un máximo de 3 segundos, salvo que exista una demora externa de la plataforma o de la integración.
    
- Los importes y volúmenes deben conservar la precisión decimal requerida por el mercado correspondiente.
    

**Trazabilidad:** Función «Negociación y cierre de deals de energía» · Entidades  
`TradeOffer`, `EnergyDeal`, `Trader`, `Counterparty`, `EnergyProduct`, `Market`, `AuditLog`

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
