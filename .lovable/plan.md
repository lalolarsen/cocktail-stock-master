# Refresh Visual Global — Carbon Pro

Renovación puramente presentacional. Cero cambios de lógica, datos, rutas, permisos o backend. Toda la mejora pasa por tokens (`index.css`), Tailwind (`tailwind.config.ts`) y variantes de componentes shadcn.

## Dirección visual

**Carbon Pro + verde STOCKIA**, microinteracciones nivel 4 (transiciones suaves, scale en hover, fades, focus rings premium — sin animaciones gratuitas).

Paleta nueva (HSL):
- `--background` 240 11% 5%   (#0B0B0F)
- `--card`       240 11% 9%   (#16161D)
- `--popover`    240 10% 11%
- `--secondary` / `--muted` / `--accent` 240 9% 16% (#2A2A35)
- `--border`     240 8% 20%
- `--input`      240 8% 18%
- `--primary`    145 100% 45% (verde STOCKIA, sin cambio)
- `--ring`       145 100% 45%
- Sidebar: capa más profunda que el resto (240 12% 4%)

## Cambios

### 1. Tokens — `src/index.css`
- Reemplazar paleta `:root` y `.dark` por valores Carbon Pro (arriba).
- Añadir tokens nuevos:
  - `--radius: 0.5rem` (sube de 0.25 → más Apple-like)
  - `--shadow-sm/md/lg/glow` (sombras suaves carbon)
  - `--gradient-surface`, `--gradient-primary`, `--gradient-glow`
  - `--elevation-1/2/3` (capas grafito)
- Reemplazar `transition-fast/normal` por curvas con `cubic-bezier(0.4, 0, 0.2, 1)`.
- Añadir utilidades: `.glass-surface`, `.hairline`, `.elevation-1/2/3`, `.glow-primary`, `.btn-press` (scale 0.97 active).
- Keyframes nuevos: `shimmer`, `slide-up`, `scale-in`.

### 2. Tailwind — `tailwind.config.ts`
- Extend `boxShadow`: `sm/md/lg/glow/inset-hairline` desde tokens.
- Extend `backgroundImage`: `surface`, `primary`, `glow`.
- Extend `transitionTimingFunction`: `smooth: cubic-bezier(0.4, 0, 0.2, 1)`.
- Keyframes/animation: añadir `shimmer`, `slide-up`, `scale-in` (0.2s smooth).

### 3. Componentes shadcn (solo `className` / variants — sin lógica)

| Componente | Cambio visual |
|---|---|
| `button.tsx` | Sombras sutiles, `active:scale-[0.98]`, transición `smooth 150ms`, variant `default` con leve gradient + glow en hover, `outline` con hairline border, nuevas variants `premium` (gradient + glow) y `subtle` (bg-secondary/50). Tamaño `lg` h-12. |
| `card.tsx` | `bg-card` + `border-border/60` + `shadow-sm`, hover `shadow-md` opcional, radius `lg`. |
| `input.tsx` / `textarea.tsx` | `bg-input/40`, hairline border, focus ring con glow verde, transición smooth. |
| `select.tsx` | Trigger matchea input; content con `elevation-2` + scale-in. |
| `dialog.tsx` / `sheet.tsx` / `popover.tsx` | Backdrop `bg-background/60 backdrop-blur-md`, contenedor con `elevation-3`, animación slide-up + scale-in. |
| `tabs.tsx` | TabsList `bg-secondary/40 border border-border/40`, trigger activo con `bg-card shadow-sm` (indicador tipo pill). |
| `table.tsx` | Header `bg-secondary/30 uppercase tracking-wide text-xs`, row hover `bg-secondary/30`, separadores `border-border/40`. |
| `badge.tsx` | Variants con tintes (success/warning/info) más legibles, hairline. |
| `tooltip.tsx` | `elevation-2`, micro animación. |
| `switch.tsx` / `checkbox.tsx` | Track/thumb refinados, focus ring verde. |
| `scroll-area` / scrollbars | Más finos (4px), thumb verde a 30%. |
| `skeleton.tsx` | Shimmer animado con gradient. |
| `progress.tsx` | Glow verde en fill. |
| `sidebar.tsx` | Background `--sidebar-background` (más profundo), item activo con pill verde sutil + hairline izquierdo verde, hover `bg-sidebar-accent/70`. |

### 4. Tipografía
- Mantener SF Pro stack.
- Aumentar `font-weight` de headings: 600 → 700 (ya está), pero añadir `tracking-tight` por defecto a `h1-h3` vía CSS base.
- Tabular numbers (`font-variant-numeric: tabular-nums`) para `.kpi-value` y celdas numéricas de tablas.

### 5. Microinteracciones (nivel 4)
- Toda transición de UI: `150–200ms` con `ease-smooth`.
- `hover:scale-[1.01]` en cards interactivas, `active:scale-[0.98]` en botones/triggers.
- `fade-in` + `slide-up` 200ms en montaje de dialogs, sheets, popovers, dropdowns.
- Skeletons con shimmer.
- Sin animaciones decorativas en KPIs financieros (lectura rápida).

## Fuera de alcance (no se toca)

- Lógica de POS, Bar, jornadas, cobros, tickets, lector de facturas, KPIs en vivo.
- Hooks, queries Supabase, RLS, edge functions.
- Estructura de páginas, navegación, permisos.
- Tipografía base (sigue SF Pro).
- Verde primario `#00E676` (sin cambio — branding core).

## Riesgo

🟢 Bajo. Solo presentación (tokens + classNames + variants). Reversible 1:1 vía History. Sin migraciones, sin cambios de tipos, sin renombres. Los componentes shadcn mantienen API idéntica, por lo que ningún consumidor se rompe.

Posible colateral: contraste mínimo a verificar en `muted-foreground` sobre `card` nuevo — se ajusta si el test visual lo pide.

## Verificación post-build

1. `/admin` Dashboard — cards, KPIs, tabs JornadaKPIPanel.
2. `/sales` POS — botones grandes, grids de productos legibles.
3. `/bar` redención — escáner y dialogs.
4. Sidebar — item activo distinguible.
5. Modo Hybrid POS + Tickets.
6. Tablas largas (Productos, Compras) — header sticky + zebra hover.
