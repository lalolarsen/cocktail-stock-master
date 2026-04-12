

# Plan: Eliminar límite de 1000 ventas + optimizar carga de Analytics

## Problema

1. **Reportes incompletos**: Supabase retorna máximo 1000 filas por query. Los queries de ventas en `ReportsPanel`, `AnalyticsPanel` y `useFinanceMTD` no pagina más allá de 1000, perdiendo datos de jornadas con alto volumen.

2. **Analytics lento**: `AnalyticsPanel` hace queries secuenciales (ventas → luego sale_items en batches) creando un waterfall lento.

## Solución

### Utilidad compartida: `fetchAllRows`

Crear helper en `src/lib/supabase-batch.ts` que pagine automáticamente cualquier query Supabase en bloques de 1000, acumulando todos los resultados:

```typescript
async function fetchAllRows<T>(queryBuilder, pageSize = 1000): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await queryBuilder.range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/supabase-batch.ts` | **Nuevo** — helper `fetchAllRows` reutilizable |
| `src/components/dashboard/ReportsPanel.tsx` | Línea 135-139: paginar ventas por jornada con `fetchAllRows` en vez de query simple |
| `src/components/dashboard/AnalyticsPanel.tsx` | Línea 107-115: paginar ventas con `fetchAllRows`; paralelizar sale_items batches con `Promise.all` en vez de loop secuencial |
| `src/hooks/useFinanceMTD.ts` | Líneas 173-191: paginar queries de ventas y sale_items con `fetchAllRows` |

### Detalle por archivo

**ReportsPanel** — El query de ventas (línea 136-139) `.in("jornada_id", jornadaIds)` se reemplaza por paginación automática. Si hay más de 1000 ventas en el mes, se traen todas.

**AnalyticsPanel** — Dos mejoras:
1. Ventas: paginar con `fetchAllRows` para traer mes completo
2. Sale items: cambiar loop `for` secuencial (líneas 147-155) por `Promise.all` de todos los batches en paralelo → reduce latencia significativamente

**useFinanceMTD** — Paginar las queries de ventas (líneas 173-181, 186-191) y sale_items (línea 240-243) para no perder datos.

## Lo que NO se toca

- Schema / DB / RPC
- Lógica de cálculo de métricas
- UI de los paneles (solo se cambia la capa de fetching)

