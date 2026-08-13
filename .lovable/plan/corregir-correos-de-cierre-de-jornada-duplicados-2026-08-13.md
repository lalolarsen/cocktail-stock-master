# Corregir correos de cierre de jornada duplicados

## Diagnóstico (confirmado)

Las ventas no están duplicadas en la base de datos: no hay números de venta repetidos ni ventas duplicadas por doble clic (en más de 17.000 ventas solo hay 1 par bajo 5 segundos, y son ventas reales distintas).

Lo que sí está duplicado es el **correo de cierre de jornada**: en el cierre de la jornada #106 (9 ago 08:46 UTC) cada destinatario recibió el resumen **dos veces**, con 0,3 segundos de diferencia:

- didax.dr@gmail.com — 2 envíos
- eduardolarsen101@gmail.com — 2 envíos
- duque.mauricio@gmail.com — 2 envíos

Causa: el resumen se despacha por dos caminos a la vez.

1. Un disparador en la tabla de jornadas (`trg_dispatch_jornada_closed_email`) que se ejecuta cuando el estado pasa a "cerrada".
2. Una llamada explícita adicional dentro de las funciones de cierre `close_jornada_manual` y `close_jornada_with_summary`.

Como cada envío genera su propio identificador, la clave de idempotencia no alcanza a bloquear el segundo.

## Cambios

1. Quitar la llamada explícita al despacho dentro de `close_jornada_manual` y `close_jornada_with_summary`, dejando el disparador como único camino (funciona igual para cierre normal y forzado).
2. Añadir una guarda de idempotencia dentro de `dispatch_jornada_closed_email`: si ya existe un registro de envío del resumen para esa jornada, no vuelve a despachar. Esto protege también ante reintentos o reaperturas/cierres repetidos.
3. Verificar tras el cambio consultando el registro de envíos que el próximo cierre genere un solo correo por destinatario.

## Detalles técnicos

- Migración que reemplaza las tres funciones (`close_jornada_manual`, `close_jornada_with_summary`, `dispatch_jornada_closed_email`) manteniendo el resto de su lógica intacta.
- La guarda usará una marca por jornada (columna existente o consulta al log de envíos por clave `jornada-<id>-<email>`) para decidir si el resumen ya fue emitido.
- Sin cambios en ventas, stock ni cálculo financiero.
