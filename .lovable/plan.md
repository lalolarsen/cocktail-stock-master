# Solución a bloqueos frecuentes de PIN de trabajadores

## Diagnóstico

Hoy el login de trabajadores (RUT + PIN) se bloquea con la regla **5 intentos fallidos en 15 minutos** (función `is_account_locked`). Esto produce bloqueos seguidos porque:

1. **El contador no se reinicia con un login exitoso.** Si el trabajador tipea mal el PIN 4 veces y luego acierta, el siguiente error (incluso al día siguiente dentro de 15 min) lo bloquea.
2. **Errores de tipeo en el RUT generan "RUT fantasma"** (ej. `213263684` vs `21326368`) que igual incrementan intentos contra rut válidos cercanos cuando se corrige.
3. **No hay forma de desbloquear desde Admin** — hay que esperar 15 min sí o sí.
4. **No se distingue entre "RUT no existe" y "PIN incorrecto"**, ambos cuentan igual.

Datos: en la última semana hay varios RUT con 5+ fallos en pocos minutos (`27838877`, `208843060`, etc.), confirmando el patrón.

## Cambios propuestos

### 1. Backend — política de bloqueo más tolerante y auto-reset

Migración SQL:

- **Subir umbral** a `8 intentos fallidos en 10 minutos` (en lugar de 5/15).
- **`is_account_locked`** sólo cuenta fallos **posteriores al último éxito** del mismo `rut_code`. Así, un login correcto limpia el historial efectivo.
- Nueva RPC **`unlock_worker_account(p_rut_code text)`** (SECURITY DEFINER, restringida a `admin` / `gerencia`) que borra los `login_attempts` fallidos de ese RUT en el `venue_id` actual y deja registro en `admin_audit_logs`.
- Nueva RPC **`get_locked_workers()`** que devuelve trabajadores actualmente bloqueados del venue (rut, nombre, intentos, minutos restantes).

### 2. Frontend Auth (`src/pages/Auth.tsx`)

- Mostrar mensaje específico cuando el RUT no existe ("RUT no registrado") sin contarlo como intento fallido contra ese RUT (se sigue logueando, pero el conteo de bloqueo sólo aplica si el RUT existe).
- Mostrar **minutos restantes** estimados cuando esté bloqueado, no sólo "15 minutos".
- Texto de error de PIN incorrecto indicando intentos restantes antes del bloqueo (ej. "PIN incorrecto. Te quedan 3 intentos").

### 3. Admin UI — botón de desbloqueo

En **Dashboard → Trabajadores** (o sección equivalente de gestión de personal):

- Nuevo banner/sección **"Cuentas bloqueadas"** que aparece sólo si hay alguna, listando: nombre, RUT, intentos fallidos, hace cuánto.
- Botón **"Desbloquear"** por fila → llama `unlock_worker_account` y muestra toast.
- Permiso: visible sólo para `admin` y `gerencia`.

## Detalles técnicos

```text
Threshold actual:   5 fallos / 15 min, sin reset por éxito
Threshold nuevo:    8 fallos / 10 min, reseteo automático tras login exitoso
Desbloqueo manual:  RPC + botón en Trabajadores (admin/gerencia)
```

Archivos a tocar:
- Migración nueva en `supabase/migrations/` (redefinir `is_account_locked`, crear `unlock_worker_account` y `get_locked_workers`).
- `src/pages/Auth.tsx` — mensajes y conteo restante.
- `src/components/dashboard/` — nuevo componente `LockedAccountsPanel.tsx` y montarlo donde se gestionan trabajadores.

## Fuera de alcance

- Cambiar el método de auth (RUT+PIN se mantiene).
- Reset de PIN (ya existe en gestión de trabajadores).
- Captcha o 2FA.
