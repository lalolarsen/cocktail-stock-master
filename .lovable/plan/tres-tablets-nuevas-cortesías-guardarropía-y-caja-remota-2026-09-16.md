# Tres tablets nuevas: Cortesías, Guardarropía y Caja remota

Tres tablets Samsung Galaxy con impresora Bluetooth, cada una con una función fija.

| Tablet | Quién entra | Qué hace | Imprime |
|---|---|---|---|
| Cortesías | Solo administrador (RUT + PIN) | Emitir covers de cortesía | Cover físico, sin QR |
| Guardarropía | Cualquier trabajador habilitado (RUT + PIN) | Cobrar y entregar número de guarda | Ticket con número |
| Caja remota | Vendedor (RUT + PIN) | POS de siempre | Boleta / cover actual |

La caja remota no necesita desarrollo nuevo: se crea una caja más en "Barras y POS" y se entra con el POS actual.

## 1. Tablet de Cortesías

Pantalla de una sola tarea, botones grandes:

1. Elegir producto de la carta (búsqueda + botones grandes).
2. Cantidad con botones − / +.
3. Motivo opcional en una lista corta (Socio, RRHH, Invitado, Otro).
4. Botón grande "Emitir e imprimir".

Al confirmar se registra la cortesía (como hoy, ya entregada, con descuento teórico de insumos) y sale el cover impreso de inmediato. Debajo queda una lista de las cortesías de la noche con botón "Reimprimir".

Acceso: solo el rol administrador entra a esta pantalla. Si entra alguien más, ve un mensaje claro de que no tiene permiso. Además hay un botón "Bloquear" para dejar la tablet en pantalla de PIN entre usos, para que nadie emita cortesías si el admin se aleja.

## 2. Tablet de Guardarropía

Flujo de entrega:

1. Botón grande "Guardar prenda".
2. Cantidad de prendas (− / +) y precio que se calcula solo según la tarifa configurada.
3. Elegir pago: Efectivo o Tarjeta.
4. "Cobrar e imprimir" → sale un ticket con número grande (correlativo de la noche) para el cliente.

Flujo de retiro:

- Lista de guardas activas de la noche, buscables por número.
- Botón "Entregar" que marca la prenda como retirada, con hora.

Al final de la noche el guardarropía queda incluido en el cierre de jornada: total recaudado, desglose efectivo/tarjeta y prendas sin retirar.

Tarifa configurable en Config (por ejemplo $2.000 por prenda), para no tener que tocar el sistema cada vez que cambie.

## 3. Caja remota

Solo configuración:

1. Crear la caja "Caja remota" en Barras y POS, con impresora asignada.
2. El vendedor entra con su RUT y PIN y elige esa caja.

Sus ventas entran al mismo cierre de jornada que el resto, sin nada especial.

## Impresión Bluetooth (a probar)

Las impresoras son nuevas y no se han probado con la app. La app hoy imprime a través del navegador, así que en cada tablet hay que:

1. Emparejar la impresora en Android y dejarla como impresora predeterminada del sistema.
2. Instalar la app en modo pantalla completa (se agrega al inicio como aplicación).
3. Imprimir un ticket de prueba desde la app y ajustar el ancho (58 mm u 80 mm).

Si el modelo de impresora no aparece en el diálogo de impresión de Android, la alternativa es instalar el complemento de impresión del fabricante (Samsung/Zebra/Epson lo ofrecen gratis en Play Store). Te dejo esa comprobación como primer paso, antes de dar por cerrado el flujo.

## Opciones que necesito que decidas

- **A. Tarifa de guardarropía:** precio único por prenda, sin ofertas ni descuentos por cantidad (decidido).
- **B. Ticket de guardarropía:** dos tickets con el mismo número, uno para el cliente y otro para pinchar en la prenda (decidido).
- **C. Cortesías:** motivos fijos Socio, Embajador, Cortesía y Otros (decidido).

## Detalles técnicos

- **Rutas nuevas:** `/cortesias` (solo rol `admin`) y `/guardarropia` (roles `admin`, `gerencia` y un rol operativo de guardarropía). Ambas protegidas por `ProtectedRoute` y con guardia de jornada activa.
- **Cortesías:** reutiliza `courtesy_qr` y `printCourtesyCover`; la pantalla nueva es una versión táctil de `CourtesyQRSimple`, sin listados largos ni exportaciones.
- **Guardarropía:** tabla nueva `coatcheck_tickets` (venue_id, jornada_id, ticket_number, garment_count, amount, payment_method, status issued/retrieved, issued_by, retrieved_at) con RLS por venue y GRANT a `authenticated` y `service_role`. Correlativo por jornada mediante función en base de datos.
- **Tarifa:** fila en `jornada_config` o tabla de configuración simple (`coatcheck_price`), editable desde Config.
- **Cierre de jornada:** el resumen financiero y el correo suman el ingreso de guardarropía como línea aparte, sin mezclarlo con ventas de barra.
- **Caja remota:** sin cambios de código; nueva fila en `pos_terminals` con `pos_kind` de caja y `printer_name`.
- **Bloqueo de tablet:** reutiliza `WorkerPinDialog` para volver a pedir PIN sin cerrar sesión.
- **Impresión:** se mantiene `printRaw` con selección 58/80 mm por tablet (`getPreferredPaperWidthStorageKey`).
