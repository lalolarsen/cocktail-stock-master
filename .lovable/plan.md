

## Diagnóstico

Analizando el flujo de Tickets (POS), hay 4 problemas relacionados:

1. **Recientes no imprimibles** — `RecentSalesPanel` (usado por Sales/Alcohol) tiene reimpresión, pero el POS de Tickets (`/tickets` → `Tickets.tsx`) probablemente no lo monta o usa un panel propio sin botón de reimprimir QRs/comprobante.

2. **Sin "Descargar Resultados de Jornada"** — Existe `RedeemReportButton` y el reporte de cajero PDF (`pos-cashier-session-results-pdf`) en el POS de alcohol, pero el POS de Tickets no lo expone.

3. **No pide selección de Cover** — La RPC `create_ticket_sale_with_covers` ya acepta `p_cover_selections jsonb`, y existe la memoria `mem://features/tickets/cover-multi-option-and-printing`. El frontend de Tickets debe abrir un selector cuando un ticket type tiene múltiples cocktails/opciones de cover, pero actualmente lo está creando directamente sin abrir el dialog de selección.

4. **Impresión 3 piezas** — `printTicketSale` existe en `src/lib/printing/ticket-print.ts` pero es posible que `Tickets.tsx` no lo invoque, o lo invoque sin esperar covers seleccionados.

Necesito leer `src/pages/Tickets.tsx` y los componentes asociados para confirmar el alcance exacto antes de planificar.

## Exploración necesaria (en implementación)

- `src/pages/Tickets.tsx` — flujo actual de venta + qué panel de recientes usa
- `src/components/dashboard/TicketTypesManagement.tsx` — cómo se configuran las opciones de cover por ticket type
- `mem://features/tickets/cover-multi-option-and-printing` — regla canónica del flujo de covers
- Revisar si existe un `CoverSelectionDialog` o equivalente

## Plan de corrección

### A. Selector de Cover obligatorio antes de cobrar
- Antes de llamar a `create_ticket_sale_with_covers`, si **alguno de los items del carrito es un ticket type con `cover_options.length >= 1`**, abrir un dialog modal:
  - Listar cada unidad de cover (ej: "Cover #1 de 3") con un select de las opciones disponibles (cocktails configurados en el ticket type).
  - Bloquear "Cobrar" hasta que todas las unidades tengan cocktail asignado.
  - Construir `p_cover_selections` como `[{ ticket_type_id, cover_index, cocktail_product_id, cocktail_name }, ...]`.
- Pasar `cover_selections` a la RPC + a `printTicketSale` para que cada cover impreso muestre el cocktail correcto.

### B. Impresión 3 piezas correctamente disparada
- Tras éxito de la RPC, leer los `pickup_tokens` recién creados (entryTokens + coverTokens con `short_code`) y llamar a `printTicketSale({ ..., entryTokens, coverTokens })`.
- Respetar `paperWidth` desde `localStorage` igual que el POS de alcohol.

### C. Panel de Recientes con reimprimir en Tickets
- Montar `RecentSalesPanel` (o una variante) en `Tickets.tsx` con:
  - Filtrado por `pos_id` y jornada activa.
  - Botón "Reimprimir" por venta que recupera tokens asociados y vuelve a llamar a `printTicketSale` (aplica regla de reimpresión Hybrid/POS de la memoria `pos-sales-history-reprint-v2` — para Tickets sí debe permitirse reimprimir QRs porque son la entrada física).

### D. Botón "Descargar Resultados de Jornada"
- Añadir el mismo botón que aparece en POS de Alcohol (`pos-cashier-session-results-pdf`) en el header/footer de `Tickets.tsx`.
- Genera el PDF de cierre parcial del cajero usando los datos de la jornada activa filtrados por el `pos_id` de Tickets.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/pages/Tickets.tsx` | Integrar selector de cover, impresión 3 piezas, panel de recientes con reimpresión, botón descargar PDF |
| `src/components/sales/CoverSelectionDialog.tsx` (nuevo) | Modal de asignación de cocktails por unidad de cover |
| `src/components/sales/RecentTicketSalesPanel.tsx` (nuevo o reuso de RecentSalesPanel) | Listado de ventas recientes con botón reimprimir |
| `src/lib/printing/ticket-print.ts` | (verificar) que acepte selecciones de cover y las inyecte por pieza |
| `src/components/dashboard/TicketTypesManagement.tsx` | (verificar) que las opciones de cover queden expuestas en el ticket type que consume el POS |

## Memoria a actualizar

`mem://features/tickets/cover-multi-option-and-printing` — confirmar que el flujo POS:
1. Bloquea cobro hasta selección de cover por unidad.
2. Imprime 3 piezas (comprobante + N entradas + N covers con cocktail asignado).
3. Permite reimprimir desde Recientes.
4. Expone descarga de PDF de resultados de jornada.

