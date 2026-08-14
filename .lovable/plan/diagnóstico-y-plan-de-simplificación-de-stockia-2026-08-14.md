# Diagnóstico y plan de simplificación de STOCKIA

## Qué encontré

Revisé la navegación (sidebar admin/gerencia), las pantallas de POS y los datos reales de uso de los últimos meses.

**Uso real (datos de la base):**
- Ventas: 18.827 (4.175 en los últimos 30 días) — el POS es el corazón de la app.
- Tickets: 4.289 · QR de retiro: 15.374 · Jornadas: 105 — flujo operativo sano.
- Anulaciones: 4 registros en total.
- Add-ons: 1 solo registro configurado.
- Lector de facturas: 7 importaciones.
- Cortesías ($0): 0 ventas registradas.
- Catálogo: 207 productos, 99 recetas (sin cambios desde abril/junio).

**Problemas de experiencia detectados:**
1. El menú admin tiene 14 opciones repartidas en 7 grupos. Varias de ellas (Anulaciones, Notificaciones, Configuración, Puntos de Venta, Tickets) se tocan una o dos veces al mes, pero ocupan el mismo peso visual que Dashboard o Jornadas.
2. Cortesías tiene su propia sección completa sin uso real registrado.
3. Add-ons está prácticamente vacío pero sigue apareciendo en el flujo de venta, agregando un paso al cajero.
4. El personal de la disco (vendedor / barra / tickets) no usa el admin: entra al POS. Ahí el objetivo debe ser menos texto, botones más grandes y menos decisiones por venta.
5. Las pantallas de POS son archivos muy grandes (Sales 1.259 líneas, Tickets 1.064), con lógica y UI mezcladas, lo que hace que cada ajuste visual sea riesgoso.

## Qué propongo hacer

### 1. Menú admin: de 14 opciones a 6 visibles
Reagrupar en tres bloques:
- **Operación**: Dashboard, Jornadas, Compras (lector de facturas)
- **Negocio**: Análisis, Reportes, Catálogo (productos + carta en una sola vista con pestañas)
- **Avanzado** (grupo colapsado, cerrado por defecto): Puntos de Venta, Trabajadores, Tickets, Anulaciones, Cortesías, Notificaciones, Configuración

Nada se elimina ni se pierde: lo poco usado queda un clic más abajo.

### 2. POS más simple para el personal
- Botones de producto más grandes, con precio legible a distancia y menos texto secundario.
- Barra de acción fija abajo (Total + Cobrar) siempre visible, sin scroll.
- Ocultar el selector de add-ons cuando el producto no tiene add-ons configurados (hoy aparece igual).
- Confirmación de cobro en un solo paso: método de pago y confirmar en la misma pantalla.
- Estados claros de "vendiendo / imprimiendo / listo" para evitar dobles toques.

### 3. Pulido visual global (sobre el sistema Carbon Pro ya existente)
- Unificar tamaños de botón, altura de fila de tabla y espaciados en los paneles admin.
- Encabezados de sección consistentes (título + acción a la derecha) en todos los paneles.
- Estados vacíos con mensaje útil en vez de tablas en blanco.
- Revisión de contraste y tamaño mínimo de toque (44px) en tablets del local.

### 4. Limpieza técnica (sin cambios de comportamiento)
- Dividir `Sales.tsx` y `Tickets.tsx` en componentes de presentación + hooks de lógica, para que futuros ajustes visuales no toquen la lógica de venta.

## Detalles técnicos

- Cambios concentrados en `src/components/AppSidebar.tsx` (secciones y grupo colapsable), `src/pages/Admin.tsx` (fusionar productos/carta en una vista con pestañas), `src/pages/Sales.tsx`, `src/pages/Tickets.tsx`, `src/components/sales/*` y tokens/utilidades en `src/index.css`.
- Sin migraciones de base de datos, sin cambios en RLS, ni en lógica de jornadas, stock teórico o correos.
- Las rutas y permisos por rol se mantienen exactamente iguales.

## Orden de ejecución

1. Reorganización del menú admin y vista unificada de Catálogo.
2. Rediseño del POS de alcohol y de tickets.
3. Pulido visual transversal de paneles admin.
4. Refactor de archivos grandes del POS.
