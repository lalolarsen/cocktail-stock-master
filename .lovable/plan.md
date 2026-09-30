# Botón "Ayuda" en las tablets

Un botón "Ayuda" arriba en las pantallas de tablet: Cortesías, Guardarropía y Entradas/Alcohol cuando se usan en tablet. Abre una guía corta con pasos numerados, letra grande y sin tecnicismos.

## Contenido de la guía

**1. Si no imprime, revisa el Bluetooth (lo más común)**
1. Desliza desde arriba de la pantalla y revisa que el Bluetooth esté encendido (ícono azul).
2. Mantén presionado el ícono de Bluetooth. En "Dispositivos vinculados" debe aparecer la impresora, con un nombre como **SD-** y números (ejemplo: SD-1234).
3. Si no aparece o dice "desconectado", tócala para conectar.
4. Revisa que la impresora esté encendida, con papel y la tapa cerrada.
5. Vuelve a la app e intenta de nuevo.

**2. Si aún no imprime**
- Apaga y enciende la impresora, espera 10 segundos e intenta de nuevo.
- Si no funciona, **avisa al administrador**. No cambies ajustes dentro de la app de impresión (RawBT).

**3. Uso básico de esta pantalla** (cambia según la tablet)
- Cortesías: elegir trago, motivo, cantidad y "Emitir e imprimir".
- Guardarropía: tipo, cantidad, pago y "Cobrar e imprimir". El comprobante es para el trabajador. "Resumen" al final de la noche.
- Entradas / Alcohol: agregar productos, elegir pago y cobrar. En tablet sale solo el cover.

**4. Qué NO hacer**
- No abrir ni configurar RawBT.
- No cerrar sesión ni cambiar de caja sin avisar.
- No desvincular la impresora.

## Detalles técnicos
- Nuevo componente `TabletHelpButton` (Dialog shadcn) con prop `screen: "cortesias" | "guardarropia" | "tickets" | "alcohol"` para la sección 3.
- Se agrega en el encabezado de `Cortesias.tsx`, `Guardarropia.tsx`, `Tickets.tsx` y `Sales.tsx`, junto al botón "Volver". En Tickets/Sales se muestra siempre (útil también en PC), destacado en Android.
- Solo cambios de pantalla, sin cambios en la base de datos.
