
# Plan: Adopción del nuevo flujo de Inventario en vivo + Informe PDF

## Objetivo
El módulo `live-inventory` ya existe como una pestaña aislada en el sidebar. Este plan lo **integra al flujo principal del administrador**, lo hace más fácil de adoptar visualmente, y agrega la **descarga de un PDF de inventario actual** al estilo del informe de canjes.

---

## 1. Integración en el flujo del administrador

### 1.1 Promover "Inventario en vivo" como módulo principal de inventario
- En `AppSidebar.tsx`, sección **Inventario**, reordenar y renombrar:
  - "En vivo" → **"Inventario en vivo"** (primero, ícono `Activity` + badge "NUEVO" sutil)
  - "Inventario" (Hub Excel) → **"Operaciones Excel"** (segundo)
  - "Productos" y "Comparación" se mantienen abajo
- Esto comunica que el panel en vivo es ahora el **dashboard principal de stock**, mientras que `InventoryHub` queda como herramienta operativa Excel.

### 1.2 Acceso directo desde el Dashboard (Overview)
- En `AdminOverview.tsx`, agregar un **bloque destacado** arriba de los KPIs existentes:
  - Tarjeta "Inventario en vivo" con:
    - KPIs resumidos (capital, productos bajo mínimo, sin stock) leídos del mismo `useRealtimeInventory`
    - 3 botones de acción rápida: **Ver inventario en vivo**, **Conteo de cierre**, **Subir factura (foto)**
    - Indicador de última actualización en tiempo real (punto verde animado cuando hay eventos)
- Esto reemplaza/complementa la entrada actual al inventario y vuelve obvio el nuevo flujo.

### 1.3 Onboarding contextual (mensajes informativos)
Dentro de `RealtimeInventoryDashboard.tsx`, agregar un **banner explicativo descartable** (persistido en `localStorage` por venue):
> **Cómo funciona ahora tu inventario**
> 1. **Compras / Ingresos** → Subí la factura con foto desde aquí. La IA la procesa y carga el stock en bodega.
> 2. **Stock en vivo** → Esta tabla se actualiza sola cada vez que se redime un QR en barra. No hace falta refrescar.
> 3. **Conteo de cierre** → Al final de la jornada, los bartenders cuentan físicamente. Diferencias >10% generan alerta automática.
> 4. **Informe PDF** → Descargá el inventario actual cuando lo necesites (auditoría, seguros, gerencia).

Cada paso con su ícono y un botón "Entendido" para ocultarlo.

### 1.4 Tooltips guiados en los botones principales
Usar `GuidedTooltip` (ya existe en el proyecto) en los 3 botones del header del panel:
- "Subir factura": *"Reemplaza la carga manual de stock. Toma foto y la IA hace el resto."*
- "Conteo de cierre": *"Bartenders cuentan al cierre. Diferencias >10% se reportan a admin."*
- "Actualizar": *"Forzar refresh manual. Normalmente no es necesario, se actualiza solo."*

### 1.5 Mensajes informativos en estados vacíos
- Si `rows.length === 0`: card grande con CTA "Aún no tenés inventario cargado. Subí tu primera factura" + botón.
- Si `lastUpdate > 5 min` sin eventos: chip sutil "Sin movimientos recientes" en lugar del distance label.

### 1.6 Mejora visual del panel
- Añadir indicador **pulse verde** junto al título cuando llega un evento Realtime (anima 2s).
- KPIs con micro-tendencia: comparar contra snapshot de hace 1h (delta % en chip).
- Tabla: agregar **agrupación opcional por categoría** (toggle al lado del buscador) para que el admin escanee por familia (whisky, ron, etc.).
- Filas críticas (sin stock) con tinte rojo sutil en el fondo.
- Sticky header dentro de la tabla para tablets.

---

## 2. Mejora del Conteo de Cierre

### 2.1 Onboarding del diálogo
Encabezado del `ShiftCountDialog.tsx` con paso a paso visual de 3 pasos en chips:
`1. Elegí ubicación → 2. Contá físicamente y escribí cantidades → 3. Aplicar`

### 2.2 Filtro pre-cargado por stock real
- Por defecto **mostrar solo productos con `theoretical > 0`** en esa ubicación (toggle "Ver todos" para incluir productos sin stock teórico, útil cuando llegó algo no registrado).
- Buscador ya existe; sumar **filtro por categoría** (chips horizontales).

### 2.3 Indicadores visuales claros
- Mientras escribe el conteo:
  - Diferencia ≥10% → fila con borde amarillo + ícono ⚠
  - Diferencia ≥30% → fila con borde rojo + ícono 🚨 + tooltip "Esta diferencia es muy alta, revisá antes de aplicar"
- Al final, **resumen previo** antes de "Aplicar":
  - "Vas a registrar X productos contados. Y diferencias generarán alerta."

### 2.4 Confirmación post-aplicación
Toast con acción "Ver alertas" que navega al panel de alertas. Si hay alertas críticas, mostrar dialog resumen con lista de productos desviados.

---

## 3. Informe PDF de Inventario Actual (NUEVO)

### 3.1 Ubicación del botón
- Agregar botón **"Descargar PDF"** en el header de `RealtimeInventoryDashboard.tsx` (junto a "Actualizar").
- También agregar acción equivalente en el dashboard `AdminOverview` (acción rápida del bloque inventario).

### 3.2 Generador
Crear nuevo archivo `src/lib/reporting/inventory-snapshot-pdf.ts` que use **`jspdf` + `jspdf-autotable`** (ya disponibles en proyecto via otros reportes; si no, usar `print-js` con HTML al estilo de `product-sales-pdf.ts` pero formato A4 en vez de 80mm).

**Formato del PDF (estilo similar al informe de canjes):**

```text
┌──────────────────────────────────────────────┐
│   [LOGO STOCKIA]   INFORME DE INVENTARIO     │
│   Venue: <nombre>   Fecha: 28-04-2026 14:30  │
├──────────────────────────────────────────────┤
│  RESUMEN GENERAL                             │
│  Capital inmovilizado:   $ 4.250.000        │
│  Productos con stock:    142                │
│  Bajo mínimo:            8                  │
│  Sin stock:              3                  │
├──────────────────────────────────────────────┤
│  POR UBICACIÓN                              │
│  ─ Bodega Principal      $ 2.800.000        │
│  ─ Barra Principal       $ 980.000          │
│  ─ Barra VIP             $ 470.000          │
├──────────────────────────────────────────────┤
│  DETALLE POR PRODUCTO (agrupado por ubic.)  │
│  Bodega Principal                            │
│   SKU      Producto        Cant   CPP   Valor│
│   ────────────────────────────────────────── │
│   ABS750   Absolut 750ml   12 u   8.500 102k │
│   ...                                        │
│   Subtotal Bodega: $ 2.800.000              │
│                                              │
│  Barra Principal                             │
│   ...                                        │
├──────────────────────────────────────────────┤
│  ALERTAS ACTIVAS                             │
│  🚨 Sin stock (3): Jagermeister, Tequila... │
│  ⚠ Bajo mínimo (8): Ron Bacardi, Vodka...   │
├──────────────────────────────────────────────┤
│  Generado por: <usuario> · 28/04/2026 14:30  │
└──────────────────────────────────────────────┘
```

### 3.3 Configuración del PDF
- A4 portrait, fuente sans, encabezado fijo en cada página con número de página.
- Tablas con `autoTable`: rayas alternadas, totales destacados.
- Filas críticas resaltadas en rojo claro, bajas en amarillo.
- Marca de agua sutil "STOCKIA" si modo demo.
- Nombre archivo: `inventario_<venue>_<YYYYMMDD_HHmm>.pdf`.

### 3.4 Datos de origen
Usa el mismo `useRealtimeInventory` (rows + totals) — sin nueva query, garantiza consistencia con lo que el admin ve en pantalla.

---

## 4. Digitalización del inventario (recordatorio del flujo completo)

Como apoyo visual, agregar dentro del bloque overview una **"línea de tiempo del inventario"** mini-componente:

```text
[📷 Factura] → [🤖 IA extrae] → [✅ Admin valida] → [📦 Stock en Bodega]
                                                          ↓
                                                  [🔄 Reposición a barra]
                                                          ↓
                                                  [🍸 Venta + QR]
                                                          ↓
                                                  [🍷 Bar canjea (descuenta)]
                                                          ↓
                                                  [📊 Inventario en vivo]
                                                          ↓
                                                  [📋 Conteo de cierre]
                                                          ↓
                                                  [📄 Informe PDF]
```

Implementado como componente horizontal de pasos (8 chips conectados por flechas), descartable. Es educativo: comunica visualmente al admin que NO necesita hacer carga manual.

---

## 5. Detalles técnicos

**Archivos nuevos:**
- `src/lib/reporting/inventory-snapshot-pdf.ts` — generador PDF con jsPDF + autoTable.
- `src/components/dashboard/InventoryFlowTimeline.tsx` — timeline visual descartable.
- `src/components/dashboard/InventoryOnboardingBanner.tsx` — banner 4 pasos con persistencia localStorage.

**Archivos editados:**
- `src/components/AppSidebar.tsx` — reorden + badge "NUEVO" en "En vivo".
- `src/components/dashboard/AdminOverview.tsx` — bloque destacado de inventario en vivo + acciones rápidas.
- `src/components/dashboard/RealtimeInventoryDashboard.tsx` — banner onboarding, botón PDF, tooltips, agrupación por categoría, resaltado filas críticas, indicador pulse Realtime.
- `src/components/dashboard/ShiftCountDialog.tsx` — chips de pasos, filtro stock>0 por defecto, advertencias visuales de varianza, resumen pre-aplicación.

**Sin cambios de DB ni de RPC** — toda la mejora es de UX y reporting; el backend (snapshot RPC v3, audit tables, throttling) ya está en su lugar tras los cambios anteriores.

**Dependencia PDF:** verificar si `jspdf` + `jspdf-autotable` están instalados; si no, instalar (`bun add jspdf jspdf-autotable`). Alternativa: reusar patrón `print-js` HTML A4.

---

## 6. Resultado para el admin

- Al entrar al dashboard ve **inmediatamente** el estado de su inventario sin hacer clics.
- El sidebar resalta "Inventario en vivo" como entrada principal.
- Un banner inicial le explica los 4 pasos del nuevo método.
- Una línea de tiempo le muestra que el sistema digitaliza todo el flujo (foto → IA → stock → venta → canje → conteo → PDF).
- El conteo de cierre lo guía paso a paso y previene errores.
- Puede descargar el inventario como PDF profesional cuando quiera (auditoría, seguros, gerencia).

¿Avanzo con la implementación?
