# Reporte de Cortesías, motivo Socio obligatorio y reportes unificados

## 1. Cortesías: nombre obligatorio para "Socio"
- Al tocar "Socio" aparece un campo grande "Nombre del socio".
- "Emitir e imprimir" queda bloqueado hasta escribirlo (2 a 60 letras).
- Se guarda como "Socio: Nombre" en la observación, así aparece en el cover impreso, en la lista de la noche y en el reporte.

## 2. Reporte de Cortesías descargable
- Botón "Resumen" en la tablet de Cortesías (igual que Guardarropía) y en el menú de descargas de cada jornada en Reportes.
- Contenido: jornada, fecha, total de cortesías y unidades, conteo por motivo, lista por socio, tabla hora / producto / cantidad / motivo / emitido por, y bloque de firma (nombre, firma, RUT opcional).

## 3. Una sola línea para todos los reportes
Todos los PDF (Cortesías, Ventas por producto, Resultados de caja Alcohol/Entradas/Guardarropía, Resumen de jornada) usarán la misma plantilla:
- Encabezado con logo STOCKIA, nombre del reporte, Berlín Valdivia, jornada y fecha.
- Tarjetas de resumen arriba (3 a 4 cifras clave).
- Tablas con el mismo estilo (encabezado negro, filas alternadas, montos a la derecha en CLP).
- Pie con fecha de generación y número de página; firma al final donde aplique.
- Se quita información repetida o poco útil; el ticket térmico de 80 mm para cajeros se mantiene pero con el mismo orden de secciones.
- Nombres de archivo uniformes: `jornada-128_cortesias.pdf`, `jornada-128_caja-guardarropia.pdf`, etc.

## 4. Panel de reportes de jornadas
- Lista más limpia: cada jornada en una fila con número, fecha, estado, total vendido y un solo botón "Descargar" con las opciones agrupadas (Resumen, Cajas, Productos, Cortesías, Excel).
- Filtros rápidos (7 / 30 / 90 días) y búsqueda por número.
- Carga más rápida: se trae la lista paginada y los datos de cada reporte solo al pedirlo; estados de carga y error visibles.
- Se eliminan opciones que ya no aplican al modelo actual (inventario / EERR si siguen visibles).

## Detalles técnicos
- Nuevo `src/lib/reporting/pdf-template.ts` (jsPDF + autotable): `createReport`, `addKpis`, `addTable`, `addSignature`, `finish(filename)`; todos los generadores lo usan.
- Reescribir `courtesy-jornada-pdf.ts` (datos desde `courtesy_qr` + `courtesy_redemptions` por `jornada_id`, agrupando motivo desde `note`) y `product-sales-pdf.ts` sobre la plantilla; `jornada-cashier-report.ts` conserva formato 80 mm con secciones alineadas.
- `JornadaDownloadMenu.tsx`: separar la carga de datos en funciones de `src/lib/reporting/` para reutilizarlas desde las tablets.
- `ReportsPanel.tsx`: refactor visual con tokens semánticos, paginación y `fetchAllRows` donde corresponda.
- Validación con zod del nombre del socio en `Cortesias.tsx`. Sin cambios en base de datos.
