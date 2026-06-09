# STOCKIA — Berlín Valdivia

Instancia dedicada de STOCKIA para **Berlín Valdivia**. La app opera en modo single-venue: todas las queries, inserts y RLS asumen un único `venue_id` (`BERLIN_VENUE_ID`, definido en `src/lib/venue.ts` y `supabase/functions/_shared/pilot.ts`).

## Modelo actual (2026)

STOCKIA dejó de ser un sistema DiStock. Hoy es:

1. **POS puro** — Alcohol + Tickets. Cada venta imprime un **cover físico grande** + **comprobante para el vendedor**. Sin QR, sin validación digital posterior.
2. **Lector de facturas** — módulo analítico protagónico. `InvoiceAnalytics` ofrece 4 vistas: compras semanales (ISO), histórico de precio por insumo, venta vs compra teórica, top insumos por gasto y variación.
3. **Reporte de gasto de insumos** — basado en `SUM(sale_items.qty × cocktail_ingredients.cantidad)` + cortesías. Reemplaza el antiguo reporte de canjes.
4. **Cortesías sin QR** — cover físico con etiqueta "CORTESÍA $0", autoredimidas al emitir, integradas al reporte de cajero.

## Lo que se eliminó del UI

- `/bar` y todo el flujo de bartender (scanner, redenciones, botellas abiertas).
- Inventario físico (replenishment, mermas, conteos, Passline audit, external consumption).
- Estado de Resultados (EERR) y paneles financieros derivados.
- Componentes QR: scanners, dialogs de canje, cover QR.
- Rol `bar` del catálogo de roles UI (DB intacta).

## Lo que se conserva

- Catálogo de insumos (`products` con `sku_base`) y Carta (`cocktails`, `cocktail_ingredients`, `cocktail_addons`) — columna vertebral del modelo.
- Jornadas, caja, vendedores, ajustes, voids, addons, comisión STOCKIA 2.5%.
- Lector de facturas completo (`extract-invoice`, `parse-invoice`, `learning_product_mappings`).
- Documentos tributarios (`/admin/documents`).
- Notificaciones, PWA Android, tickets cover multi-opción, branding.
- DB completa: `stock_*`, `pickup_*`, `courtesy_qr`, `open_bottles`, `waste_requests` se conservan para auditoría histórica.

Ver `.lovable/plan.md` para el detalle del refactor en 8 fases.

## Project info

**URL**: https://lovable.dev/projects/b8b69534-d9c8-404e-98ce-e35d3e2f6b5c

## Stack

- Vite + TypeScript + React 18
- Tailwind CSS v3 + shadcn-ui
- Lovable Cloud (Supabase) — auth, DB, edge functions, storage
- PWA optimizado para Android

## Desarrollo local

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

## Deploy

Abrir [Lovable](https://lovable.dev/projects/b8b69534-d9c8-404e-98ce-e35d3e2f6b5c) → Share → Publish.

Dominio personalizado: Project > Settings > Domains.
