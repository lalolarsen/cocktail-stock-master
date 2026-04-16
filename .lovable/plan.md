

# Plan: Extender disponibilidad de QR a 72 horas

## Cambio

Una migración SQL que actualiza el intervalo de expiración de **2 horas → 72 horas** en dos lugares:

1. **Función `generate_pickup_token`**: cambiar `interval '2 hours'` → `interval '72 hours'`
2. **Default de columna `expires_at`** en tabla `pickup_tokens`: mismo cambio

## Archivo

| Tipo | Detalle |
|---|---|
| Migración SQL | `ALTER` default + `CREATE OR REPLACE FUNCTION` con nuevo intervalo |

Sin cambios frontend — la validación de expiración ocurre en `redeem_pickup_token` comparando `expires_at < now()`.

