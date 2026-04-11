

# Plan: QR reprint solo en caja híbrida

## Cambio

En `src/pages/Sales.tsx`, líneas 1351-1363: envolver el botón "QR" de reimprimir en una condición que solo lo muestre cuando el POS seleccionado es híbrido (`selectedPosObj?.auto_redeem && selectedPosObj?.bar_location_id`).

La caja normal solo verá el botón "Ticket" (comprobante). La caja híbrida verá ambos: "QR" y "Ticket".

## Archivo

| Archivo | Cambio |
|---|---|
| `src/pages/Sales.tsx` | Condicionar botón QR en historial reciente a POS híbrido |

