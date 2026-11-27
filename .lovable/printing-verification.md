# Diagnóstico de impresión

## Hallazgos comprobados
- Alcohol esperaba una escritura de auditoría antes de imprimir y enviaba un usuario vacío. No existían registros de Alcohol en los últimos siete días; el transporte Android era HTML, no RawBT.
- PC abría trabajos separados por pieza y eliminaba el documento a los ocho segundos aunque la vista previa siguiera abierta.
- Cortesías y Guardarropía dependían de ventanas emergentes y anunciaban éxito aunque se bloquearan.
- RawBT consideraba cualquier pérdida de foco un envío; un diálogo de selección puede producir ese evento sin abrir RawBT.
- Un único aviso pendiente ocultaba ventas anteriores cuando fallaba una nueva impresión.

## Correcciones
- Una venta PC genera un trabajo con todas sus piezas; se mantiene hasta el evento de cierre de impresión. Las solicitudes se serializan y no hay éxito inventado por timeout.
- Alcohol Android empaqueta cover y comprobante en un solo envío RawBT. Auditoría asíncrona con usuario de sesión real, no previa al envío.
- Respaldo por comprobante pendiente, bloqueo de intentos simultáneos sobre el mismo comprobante y captura de errores.
- Cortesías, Guardarropía y resúmenes usan el mismo transporte PC; en Android continúan exclusivamente con RawBT.
- Reimpresiones se autorizan antes del envío; un intento bloqueado conserva su respaldo autorizado.
- Ayuda ofrece una prueba sin venta en las cuatro cajas, con instrucciones distintas para PC y Android.

## Verificación
- 19 pruebas automatizadas aprobadas: impresión, respaldo, PIN/permisos y conteos.
- Cuenta temporal: Alcohol, Entradas, Guardarropía y Cortesías → Ayuda → prueba sin venta → un trabajo PC por prueba, confirmado con sustitución del comando físico de impresión en Chromium.
- Chromium real: cover + comprobante de Alcohol en un documento y una llamada; ningún iframe remanente tras afterprint.
- Emulación Android a 393×706: usa RawBT, sin vista previa HTML; informa que RawBT no está disponible en el entorno de prueba.
- Dos avisos pendientes se recuperan individualmente desde la interfaz.
- Sin ventas nuevas, emisión de cortesías ni cobros; sin errores JavaScript. Compilación automática correcta.

## Limitaciones
No hay impresoras físicas conectadas al entorno. La apertura de RawBT o el cierre de la vista previa NO prueba que haya salido papel. Validar en cada PC/tablet mediante Ayuda → Imprimir prueba sin venta después de publicar y actualizar la app. La causa específica de Bluetooth/USB/driver en los equipos no se puede confirmar a distancia.