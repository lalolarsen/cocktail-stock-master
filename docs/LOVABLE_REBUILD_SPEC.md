# Especificación Completa para Reconstrucción de DiStock en Lovable

> **Propósito**: Este documento proporciona todos los inputs necesarios para recrear la aplicación DiStock en un nuevo proyecto Lovable que tenga la base de datos ya configurada con los archivos SQL de `exports/schema/`.

---

## 1. Sistema de Diseño (Design System)

### 1.1 Filosofía de Diseño
**"Soft Minimal"** - Paleta neutral con un color de acento, peso visual reducido (bordes sutiles, sin sombras pesadas), transiciones rápidas.

### 1.2 Tokens de Color (index.css)
```css
/* Todos los colores DEBEN ser HSL */
:root {
  /* Fondos neutrales */
  --background: 0 0% 98%;
  --foreground: 220 15% 15%;
  --card: 0 0% 100%;
  --card-foreground: 220 15% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 220 15% 15%;

  /* Color de acento único - teal/esmeralda */
  --primary: 160 45% 40%;
  --primary-foreground: 0 0% 100%;
  --primary-glow: 160 40% 50%;

  /* Secundario neutral */
  --secondary: 220 10% 94%;
  --secondary-foreground: 220 15% 25%;
  --secondary-glow: 220 10% 88%;

  --muted: 220 10% 96%;
  --muted-foreground: 220 10% 50%;
  --accent: 220 10% 94%;
  --accent-foreground: 220 15% 25%;

  /* Destructivo - solo para acciones críticas */
  --destructive: 0 70% 55%;
  --destructive-foreground: 0 0% 100%;
  --warning: 38 90% 50%;
  --warning-foreground: 0 0% 100%;

  --border: 220 10% 90%;
  --input: 220 10% 90%;
  --ring: 160 45% 40%;

  /* Radio reducido para look limpio */
  --radius: 0.5rem;

  /* Sombras suaves */
  --shadow-soft: 0 1px 3px hsl(220 15% 15% / 0.06);
  --shadow-medium: 0 2px 8px hsl(220 15% 15% / 0.08);

  /* Transiciones rápidas */
  --transition-fast: all 0.15s ease;
  --transition-normal: all 0.2s ease;

  /* Sidebar */
  --sidebar-background: 0 0% 100%;
  --sidebar-foreground: 220 15% 25%;
  --sidebar-primary: 160 45% 40%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 220 10% 96%;
  --sidebar-accent-foreground: 220 15% 25%;
  --sidebar-border: 220 10% 92%;
  --sidebar-ring: 160 45% 40%;
}
```

### 1.3 Modo Oscuro
```css
.dark {
  --background: 220 15% 8%;
  --foreground: 220 10% 92%;
  --card: 220 15% 11%;
  --card-foreground: 220 10% 92%;
  --popover: 220 15% 11%;
  --popover-foreground: 220 10% 92%;
  --primary: 160 45% 45%;
  --primary-foreground: 0 0% 100%;
  --primary-glow: 160 40% 55%;
  --secondary: 220 15% 18%;
  --secondary-foreground: 220 10% 85%;
  --muted: 220 15% 15%;
  --muted-foreground: 220 10% 55%;
  --border: 220 15% 18%;
  --input: 220 15% 18%;
  --ring: 160 45% 45%;
  --sidebar-background: 220 15% 10%;
  --sidebar-foreground: 220 10% 85%;
  --sidebar-primary: 160 45% 45%;
  --sidebar-accent: 220 15% 15%;
}
```

### 1.4 Tipografía
- **Fuente base**: System font stack (Tailwind default)
- **KPI Values**: `text-2xl font-semibold tracking-tight`
- **KPI Labels**: `text-xs text-muted-foreground uppercase tracking-wide`
- **Tablas compactas**: `py-2 px-3`, headers `text-xs font-medium uppercase`

### 1.5 Componentes Base
Usar shadcn/ui con las siguientes variantes:
- `Card`, `Button`, `Badge`, `Dialog`, `Sheet`, `Tabs`, `Input`, `Select`, `ScrollArea`, `Skeleton`, `Alert`, `Popover`, `Collapsible`

---

## 2. Arquitectura de Autenticación

### 2.1 Flujo de Login (Auth.tsx)
**Ruta**: `/auth`

**Campos de entrada**:
| Campo | Tipo | Placeholder | Validación |
|-------|------|-------------|------------|
| RUT | `text` | `12345678` | 7-9 dígitos numéricos o `DEMO-XXX` |
| PIN | `password` inputMode="numeric" | `••••` | Mínimo 4 dígitos |

**Botones**:
| Botón | Acción | Estado disabled |
|-------|--------|-----------------|
| "Iniciar sesión" | Submit form → `signInWithPassword(email_interno, pin)` | `loading=true` |

**Lógica**:
1. Verificar si cuenta está bloqueada (`is_account_locked` RPC)
2. Obtener worker por RUT (`get_worker_by_rut` RPC)
3. Login con email interno + PIN como password
4. Registrar intento (`record_login_attempt`)
5. Registrar en `login_history`
6. Redirigir según roles

### 2.2 Selección de Modo
Si el usuario tiene múltiples roles (especialmente `vendedor`), mostrar pantalla de selección:

**Opciones**:
| Modo | Icono | Descripción | Ruta destino |
|------|-------|-------------|--------------|
| Caja Alcohol | `ShoppingCart` (verde) | Punto de venta bebidas | `/sales` |
| Caja Entradas | `Ticket` (ámbar) | Venta de tickets | `/tickets` |
| Barra | `Wine` (púrpura) | Entrega de pedidos | `/bar` |
| Administración | `Shield` (azul) | Control total/Solo lectura | `/admin` |

---

## 3. Panel de Administración (Admin.tsx)

### 3.1 Layout General
```
┌────────────────────────────────────────────────────┐
│ [☰] Título Vista Activa          [Venue Indicator] │
├─────────┬──────────────────────────────────────────┤
│ Sidebar │           Contenido Principal            │
│  240px  │                                          │
│         │                                          │
└─────────┴──────────────────────────────────────────┘
```

### 3.2 Sidebar (AppSidebar.tsx)

**Header**:
- Logo: `div` 40x40 `rounded-xl bg-primary` con ícono `Wine`
- Título: "DiStock" (bold) + "Gestión de bar" (muted)
- `VenueIndicator` con nombre del venue y rol

**Navegación Principal** (según rol y feature flags):
| Item | Icono | view_type | Feature Flag |
|------|-------|-----------|--------------|
| Panel General | `Wine` | `overview` | - |
| Jornadas | `Calendar` | `jornadas` | `jornadas` |
| Puntos de Venta | `Receipt` | `pos` | - |
| Inventario | `Warehouse` | `inventory` | `inventario` |
| Reposición | `ArrowRightLeft` | `replenishment` | `reposicion` |
| Carta | `Martini` | `menu` | `ventas_alcohol` |
| Trabajadores | `Users` | `workers` | - |
| Reportes | `FileText` | `reports` | `reportes` |

**Footer**:
- Botón "Cerrar sesión" con ícono `LogOut`

### 3.3 Vistas del Dashboard

#### A) Panel General (AdminOverview)
**Cards de Estado** (Grid 5 columnas):

| Card | Icono | Fondo | Datos |
|------|-------|-------|-------|
| Jornada | `Calendar` | `from-primary/5 to-primary/10` | Badge estado (Activa/Cerrada/Sin jornada) |
| Ingresos Brutos | `TrendingUp` | `from-emerald-500/5 to-emerald-500/10` | Total del día en CLP |
| Ventas | `DollarSign` | `from-blue-500/5 to-blue-500/10` | Total + cantidad transacciones |
| QRs Canjeados | `QrCode` | `from-violet-500/5 to-violet-500/10` | Contador del día |
| Barras | `Store` | `from-amber-500/5 to-amber-500/10` | Badges por barra (✓ operativa, ↓ low) |

**Gráficos** (Grid 4 columnas):
1. `LiveSalesChart` - Ventas en tiempo real
2. `TopProductsChart` - Productos más vendidos
3. `COGSBreakdownPanel` - Desglose de costos
4. `StockAlertsPanel` - Alertas de stock bajo

**Alerta Ventas Huérfanas** (si existen):
- Alert con fondo ámbar
- Botón "Reasignar ventas" → Abre `OrphanSalesRecoveryDialog`

#### B) Jornadas (JornadaManagement)
**Header**:
- Icono `Calendar` en div 40x40
- Título + descripción

**Card Jornada Activa** (ActiveJornadaCard):
| Estado | Color borde/fondo | Botones |
|--------|-------------------|---------|
| Sin jornada | `border-amber-500/30 bg-amber-500/5` | "Abrir Jornada" (`Play`) |
| Activa normal | `border-green-500/30 bg-green-500/5` | "Cerrar Jornada" (`Square`) |
| Activa obsoleta (>24h) | `border-amber-500/30` | "Forzar Cierre" + "Cerrar Jornada" |

**Tabs**:
| Tab | Icono | Contenido |
|-----|-------|-----------|
| Resultados en Vivo | `BarChart3` | `LiveJornadaStats` (solo si hay jornada activa) |
| Historial | `History` | `JornadaHistoryTable` con ventas, gastos, resumen |
| Configuración | `Settings` | `JornadaCashSettingsCard` |

**Diálogos**:
- `JornadaCashOpeningDialog` - Apertura con monto inicial por POS
- `CashReconciliationDialog` - Arqueo de cierre
- `JornadaCloseSummaryDialog` - Resumen post-cierre

#### C) Productos (ProductsList)
**Barra de búsqueda**:
- Input con ícono `Search`
- Placeholder: "Buscar productos..."

**Agrupación por Subcategoría**:
| Subcategoría | Descripción | Stock Type |
|--------------|-------------|------------|
| `botellas_1500` | Botellas 1500ml | volumétrico |
| `botellas_1000` | Botellas 1000ml | volumétrico |
| `botellas_750` | Botellas 750ml | volumétrico |
| `botellas_700` | Botellas 700ml | volumétrico |
| `botellines` | Venta Unitaria | unitario |
| `mixers_tradicionales` | Mixers 220/350ml | unitario |
| `mixers_redbull` | Red Bull 250ml | unitario |
| `sin_categoria` | Sin clasificar | unitario |

**Por cada producto**:
- Nombre editable (inline)
- Stock total (warehouse + bars)
- Botón expandir/colapsar para ver receta
- Botones editar/eliminar (solo admin)

#### D) Carta (CocktailsMenu)
**Acciones Header**:
| Botón | Icono | Acción |
|-------|-------|--------|
| Importar | `FileSpreadsheet` | Abre `MenuImportDialog` |
| Agregar Producto | `Plus` | Abre dialog nuevo cocktail |

**Agrupación por Categoría**:
| Categoría | Icono | Orden |
|-----------|-------|-------|
| Botellas | `Wine` | 1 |
| Espumantes | `Sparkles` | 2 |
| Destilados | `GlassWater` | 3 |
| Coctelería | `Wine` | 4 |
| Shots | `GlassWater` | 5 |
| Botellines | `Beer` | 6 |
| Cervezas Shop | `Beer` | 7 |
| Sin Alcohol | `GlassWater` | 8 |
| Promociones | `Tag` | 9 |
| Otros | `Package` | 10 |

**Cada ítem**:
- Nombre + precio (formateado CLP)
- Badge categoría
- Botones editar (`Pencil`) / eliminar (`Trash2`)
- Expandir para ver ingredientes

#### E) Trabajadores (WorkersManagementNew)
**Botón Header**: "Nuevo Trabajador" (`Plus`)

**Grid de WorkerCards**:
| Elemento | Descripción |
|----------|-------------|
| Avatar | Iniciales del nombre, fondo gradient si activo |
| Nombre | `font-semibold` |
| RUT | Enmascarado (`XX.XXX.XXX-X`) |
| Roles | Badges con colores según rol |
| Estado | Badge "Activo" (verde) / "Inactivo" (muted) |
| Fecha creación | Con ícono `Calendar` |

**Botones por worker**:
| Botón | Icono | Acción |
|-------|-------|--------|
| Historial | `History` | `WorkerHistoryDialog` |
| Editar | `Edit2` | Editar datos |
| Reset PIN | `Key` | Resetear PIN |
| Activar/Desactivar | `Power`/`PowerOff` | Toggle is_active |
| Eliminar | `Trash2` | Confirmar y eliminar |

**Roles disponibles** (types.ts):
| Rol | Label | Color | Icono |
|-----|-------|-------|-------|
| `admin` | Administrador | purple | `Shield` |
| `gerencia` | Gerencia | blue | `Eye` |
| `vendedor` | Vendedor | green | `ShoppingCart` |
| `bar` | Bartender | amber | `Wine` |
| `ticket_seller` | Vendedor Tickets | orange | `Ticket` |

---

## 4. Módulo de Ventas Alcohol (Sales.tsx)

### 4.1 Flujo de Pantallas
```
[Selección POS] → [Venta] → [Pantalla Éxito con QR]
```

### 4.2 Pantalla Selección POS
**Componentes**:
- Select con terminales `pos_type = "alcohol_sales"`
- Botón "Comenzar"

### 4.3 Pantalla de Venta
**Layout**:
```
┌────────────────────────────────────────────────────┐
│ Header: [POS Name]            [VenueIndicator]     │
├─────────────────────────────┬──────────────────────┤
│    Grid de Productos        │     Carrito          │
│    (CategoryProductGrid)    │                      │
│                             │   [Item x qty]       │
│                             │   [Item x qty]       │
│                             │                      │
│                             │   ──────────────     │
│                             │   Total: $XX.XXX     │
│                             │                      │
│                             │   [💵 Efectivo]      │
│                             │   [💳 Tarjeta]       │
│                             │                      │
│                             │   [COBRAR]           │
└─────────────────────────────┴──────────────────────┘
```

**Grid de Productos** (CategoryProductGrid):
- Agrupados por categoría (accordion colapsable)
- Cada item: nombre + precio
- Click → agregar al carrito

**Carrito**:
- Lista de items con botones `+`/`-`/`Trash`
- Selector de add-ons por item (AddonSelector)
- Total calculado en tiempo real
- Botones método de pago: Efectivo / Tarjeta

**Keyboard Shortcuts**:
| Tecla | Acción |
|-------|--------|
| `Enter` | Procesar venta |
| `Escape` | Limpiar carrito (con confirmación) |

### 4.4 Pantalla de Éxito
**Contenido**:
- Ícono check verde
- Número de venta
- Total cobrado
- **Código QR** (generado con `qrcode.react`)
- Hora de expiración del QR
- Lista de items vendidos
- Botón "Nueva Venta"

---

## 5. Módulo de Tickets/Entradas (Tickets.tsx)

### 5.1 Flujo
```
[Selección POS] → [Selección Tickets] → [Éxito con QRs]
```

### 5.2 Pantalla Venta de Tickets
**Grid de Ticket Types**:
- Cada card muestra: Nombre, Precio, Badge "Incluye Cover" si aplica
- Click → agregar al carrito

**Carrito**:
- Lista de tickets con cantidad
- Contador de covers que se generarán
- Selector método de pago (obligatorio antes de cobrar)
- Total

**Después de checkout**:
- Muestra todos los QR codes generados
- Cada QR es un cover individual (token único)

---

## 6. Módulo Bar/Bartender (Bar.tsx)

### 6.1 Modos de Lectura
| Modo | Descripción | Comportamiento post-scan |
|------|-------------|-------------------------|
| `USB_SCANNER` | Lector físico | Auto-reset después de 2.5s |
| `CAMERA` | Cámara del dispositivo | Requiere tap manual para siguiente |

### 6.2 Pantalla Principal
**Layout**:
```
┌────────────────────────────────────────────────────┐
│  [Logo]  Bartender     [Barra: XXX]  [👤 Nombre]   │
├────────────────────────────────────────────────────┤
│                                                    │
│              [ÁREA DE ESCANEO]                     │
│                                                    │
│         Estado: LISTO / PROCESANDO / ÉXITO / ERROR │
│                                                    │
├────────────────────────────────────────────────────┤
│  Historial de Escaneos (últimos 20)               │
│  [✓ Token xxxx - ENTREGAR: Pisco Sour x2]         │
│  [✗ Token yyyy - YA CANJEADO]                     │
└────────────────────────────────────────────────────┘
```

### 6.3 Estados de Scan
| Estado | Color | Icono | Mensaje |
|--------|-------|-------|---------|
| `idle` | Neutral | - | "Esperando escaneo..." |
| `processing` | Azul | `Loader2` animado | "Procesando..." |
| `success` | Verde | `CheckCircle2` | "ENTREGAR: [Producto] x[Cantidad]" |
| `error` | Rojo | `XCircle` | Mensaje de error específico |
| `waiting_resume` | Neutral | - | Botón "Escanear siguiente" |

### 6.4 Códigos de Error
| Código | Título UI | Descripción |
|--------|-----------|-------------|
| `ALREADY_REDEEMED` | YA CANJEADO | Token usado previamente |
| `TOKEN_EXPIRED` | EXPIRADO | Token venció |
| `SALE_CANCELLED` | VENTA CANCELADA | La venta fue anulada |
| `QR_INVALID` | QR INVÁLIDO | Formato no reconocido |
| `TOKEN_NOT_FOUND` | NO ENCONTRADO | Token no existe |
| `INSUFFICIENT_BAR_STOCK` | SIN STOCK EN ESTA BARRA | Falta producto |
| `WRONG_BAR` | BARRA INCORRECTA | Token para otra barra |

### 6.5 Selección de Mixer
Si el cocktail tiene `mixer_slot`, se abre `MixerSelectionDialog`:
- Lista de opciones según `mixer_category`
- Una vez seleccionado, procede con redención

---

## 7. Componentes Reutilizables Clave

### 7.1 VenueIndicator
**Props**: `variant: "sidebar" | "header"`, `showRole: boolean`
**Muestra**: Nombre del venue formateado + badge del rol

### 7.2 VenueGuard
**Función**: Wrapper que verifica `venue_id` antes de renderizar hijos
**Fallback**: Mensaje de error si no hay venue asignado

### 7.3 OutsideJornadaBanner
**Función**: Banner ámbar que aparece si no hay jornada activa
**Bloquea**: Ventas cuando `hasActiveJornada = false`

### 7.4 FeatureGate
**Props**: `feature: FeatureKey`, `featureName: string`
**Función**: Renderiza hijos solo si feature flag está activo

### 7.5 WorkerPinDialog
**Función**: Dialog para verificar PIN del trabajador
**Input**: PIN numérico de 4-6 dígitos

### 7.6 PickupQRDialog
**Función**: Mostrar QR code con datos de pickup
**Props**: token, expiresAt, items, total, barName

---

## 8. Hooks Principales

### 8.1 useAppSession (Context)
```typescript
interface AppSessionContextValue {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  role: AppRole | null;
  roles: AppRole[];
  isReadOnly: boolean;  // true si role === "gerencia"
  canModify: boolean;   // true si role === "admin"
  hasRole: (role: AppRole) => boolean;
  venue: ActiveVenue | null;
  venueError: string | null;
  displayName: string | null;
  isDemo: boolean;
  featureFlags: Record<string, boolean>;
  isEnabled: (key: FeatureKey) => boolean;
  sidebarConfig: SidebarConfigItem[] | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
}
```

### 8.2 useActiveJornada
```typescript
interface UseActiveJornadaReturn {
  activeJornadaId: string | null;
  hasActiveJornada: boolean;
}
```

### 8.3 useStockData
```typescript
interface UseStockDataReturn {
  products: ProductWithStock[];
  loading: boolean;
  refetch: () => void;
}
```

### 8.4 useReceiptConfig
```typescript
interface UseReceiptConfigReturn {
  receiptMode: "unified" | "hybrid";
  isLoading: boolean;
}
```

---

## 9. Funciones RPC Críticas

| Función | Propósito |
|---------|-----------|
| `get_worker_by_rut(p_rut_code, p_venue_id)` | Login: obtener worker por RUT |
| `is_account_locked(p_rut_code, p_venue_id)` | Verificar bloqueo por intentos fallidos |
| `record_login_attempt(...)` | Registrar intento de login |
| `generate_sale_number(p_pos_prefix)` | Generar número único de venta |
| `generate_pickup_token(p_sale_id)` | Crear token QR post-venta |
| `redeem_pickup_token(p_token, p_bartender_bar_id, p_mixer_overrides)` | Canjear QR en barra |
| `create_ticket_sale_with_covers(p_items, p_payment_method, p_jornada_id, p_pos_id)` | Venta de tickets + tokens |
| `get_venue_flags(p_venue_id)` | Obtener feature flags del venue |
| `get_sidebar_config(p_venue_id, p_role)` | Config de sidebar por rol |
| `calculate_jornada_financial_summary(p_jornada_id)` | Resumen financiero de cierre |

---

## 10. Rutas y Permisos

| Ruta | Roles Permitidos | Componente |
|------|------------------|------------|
| `/auth` | Público | `Auth` |
| `/admin` | `admin` | `Admin` |
| `/gerencia` | `gerencia` | `Admin` (isReadOnly) |
| `/sales` | `vendedor`, `admin` | `Sales` |
| `/bar` | `bar` | `Bar` |
| `/tickets` | `ticket_seller`, `vendedor`, `admin` | `Tickets` |
| `/developer` | (desarrollo) | `DeveloperPanel` |

---

## 11. Feature Flags Soportados

| Flag Key | Descripción |
|----------|-------------|
| `ventas_alcohol` | Módulo de ventas de alcohol |
| `ventas_tickets` | Módulo de venta de entradas |
| `qr_cover` | Sistema QR para covers |
| `inventario` | Gestión de inventario |
| `reposicion` | Reposición warehouse→bar |
| `importacion_excel` | Importar desde Excel |
| `jornadas` | Sistema de jornadas |
| `arqueo` | Arqueo de caja |
| `reportes` | Panel de reportes |
| `contabilidad_basica` | Gastos básicos |
| `contabilidad_avanzada` | ERP contable |
| `lector_facturas` | OCR de facturas |

---

## 12. Dependencias NPM Requeridas

```json
{
  "@supabase/supabase-js": "^2.83.0",
  "@tanstack/react-query": "^5.83.0",
  "date-fns": "^4.1.0",
  "html5-qrcode": "^2.3.8",
  "lucide-react": "^0.462.0",
  "qrcode.react": "^4.2.0",
  "react-router-dom": "^6.30.1",
  "recharts": "^2.15.4",
  "sonner": "^1.7.4",
  "xlsx": "^0.18.5",
  "zod": "^3.25.76"
}
```

---

## 13. Prompts Sugeridos para Reconstrucción

### Prompt 1: Setup Inicial
```
Crea una aplicación de gestión de bar llamada DiStock con:
1. Sistema de diseño "Soft Minimal" con color primario teal/esmeralda (HSL: 160 45% 40%)
2. Login por RUT + PIN que consulta tabla profiles y worker_roles
3. Redirección post-login según rol: admin→/admin, vendedor→/sales, bar→/bar
4. Contexto global AppSessionProvider con venue, roles, feature flags
5. Layout admin con sidebar colapsable (shadcn) y contenido principal
```

### Prompt 2: Módulo POS Alcohol
```
Implementa el módulo de ventas de alcohol (/sales) con:
1. Selección de terminal POS al iniciar
2. Grid de productos agrupados por categoría (Collapsible)
3. Carrito con items, cantidades, add-ons y total
4. Botones de pago: Efectivo y Tarjeta
5. Al completar: generar sale, sale_items, pickup_token
6. Mostrar pantalla de éxito con QR code (qrcode.react)
7. Bloquear ventas si no hay jornada activa
```

### Prompt 3: Módulo Bartender
```
Implementa el módulo de barra (/bar) con:
1. Selección de barra al iniciar
2. Dos modos de lectura: USB_SCANNER (auto-reset) y CAMERA (manual)
3. Parsear QR tokens en múltiples formatos (URL, pickup:, hex)
4. Llamar RPC redeem_pickup_token y mostrar resultado
5. Estados visuales: idle, processing, success, error
6. Historial local de últimos 20 escaneos
7. Si hay mixer_slot, mostrar MixerSelectionDialog antes de confirmar
```

---

## 14. Estructura de Archivos Recomendada

```
src/
├── components/
│   ├── ui/                    # shadcn components
│   ├── dashboard/             # Admin panels
│   │   ├── AdminOverview.tsx
│   │   ├── JornadaManagement.tsx
│   │   ├── ProductsList.tsx
│   │   ├── CocktailsMenu.tsx
│   │   ├── WorkersManagementNew.tsx
│   │   └── jornada/           # Jornada sub-components
│   ├── sales/                 # Sales components
│   ├── bar/                   # Bar components
│   └── tickets/               # Tickets components
├── contexts/
│   └── AppSessionContext.tsx  # Global session/auth context
├── hooks/
│   ├── useUserRole.ts
│   ├── useActiveVenue.ts
│   ├── useFeatureFlags.ts
│   └── useStockData.ts
├── lib/
│   ├── currency.ts           # formatCLP
│   ├── monitoring.ts         # logAuditEvent
│   └── invoicing/            # Document issuance
├── pages/
│   ├── Auth.tsx
│   ├── Admin.tsx
│   ├── Sales.tsx
│   ├── Bar.tsx
│   └── Tickets.tsx
└── integrations/
    └── supabase/
        ├── client.ts
        └── types.ts
```

---

**Nota**: Este documento asume que la base de datos ya está configurada con los archivos SQL de `exports/schema/`. Antes de implementar, verificar que todas las tablas, funciones RPC y políticas RLS estén creadas correctamente.
