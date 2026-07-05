# Fix integral del login en POS

## Diagnóstico

Los síntomas ("PIN incorrecto / RUT no registrado" erróneos + "Cuenta bloqueada" frecuente, siempre en los **mismos POS**, tanto PWA como navegador) no calzan con los datos de la base:

- Todos los trabajadores tienen `internal_email` bien formado y usuario en `auth.users`.
- En los últimos 7 días solo hay **1–2 intentos fallidos** por RUT, muy lejos del umbral de bloqueo (8 fallos / 10 min).

Eso significa que el problema no está en la contraseña del trabajador ni en su registro. Está en **el POS que envía la petición**. Encontré cuatro causas concretas que se combinan:

### 1. El PIN no se sanitiza
El input de PIN se envía tal cual a Supabase. Los teclados de Android (y algunos gestores de contraseñas) meten espacios invisibles, saltos de línea o caracteres de layout que no se ven. Basta 1 carácter invisible para que `signInWithPassword` responda "invalid credentials" → cuenta un fallo → tras 8, bloqueo. Y como el POS lo hace **cada vez** que ese trabajador entra en ese equipo, se llena el contador.

### 2. Autocomplete rellena PINs viejos
El campo PIN usa `autoComplete="current-password"`. Chrome/Samsung Pass/gestores rellenan **el PIN antiguo** del último trabajador que usó ese POS. El operador aprieta "Iniciar sesión" sin darse cuenta y falla. Repetir esto 8 veces = bloqueo real en DB.

### 3. Todo error se cuenta como "PIN incorrecto"
En `Auth.tsx`, cualquier fallo de `signInWithPassword` (rate-limit 429, timeout de red, proxy caído, CORS) entra al mismo bloque `authError` que graba `record_login_attempt(success=false)`. Un POS con red inestable puede provocar el bloqueo por sí solo sin que el operador se equivoque.

### 4. PWA con service worker desactualizado en tablets siempre encendidas
`vite.config.ts` usa `registerType: "autoUpdate"` + `NetworkFirst` para `*.supabase.co`. En tablets Android que **nunca se cierran**, el service worker viejo sigue sirviendo un bundle antiguo por horas o días. Un POS específico puede quedar con lógica de auth vieja mientras los demás ya actualizaron. Además `NetworkFirst` sobre `/auth/v1/token` es peligroso: si cae la red, sirve una respuesta cacheada (aunque sea la sesión de otro trabajador).

Como bonus, la sesión previa persiste en `localStorage` y `handleExistingSession` auto-rutea antes de que el operador pueda escribir credenciales nuevas — cuando eso falla silenciosamente (roles no cargados por token expirado), el usuario reintenta y suma fallos.

---

## Plan de fix

### A) Endurecer el flujo de login (`src/pages/Auth.tsx`)

1. **Sanitizar PIN antes de enviarlo**: `pin.replace(/[\u0000-\u001F\u007F-\u00A0\u200B-\u200F\uFEFF\s]/g, "")`. Si tras limpiar queda vacío o <4, no llamar a Supabase.
2. **Desactivar autofill de PIN viejo**: cambiar `autoComplete="current-password"` → `autoComplete="off"` + `data-form-type="other"` + `name="stockia-pin"` único. Igual para RUT: `autoComplete="off"`.
3. **Forzar limpieza de sesión previa al montar /auth**: si `getSession()` devuelve sesión pero el usuario aterrizó explícitamente en `/auth`, hacer `signOut({ scope: 'local' })` antes de mostrar el form. Esto elimina el estado fantasma que confunde `AppSessionProvider`.
4. **Distinguir error de red vs credenciales**: envolver `signInWithPassword` en try/catch y clasificar:
   - `error.status === 400` con mensaje "Invalid login credentials" → PIN realmente malo → grabar `success=false`.
   - `error.status === 429` (rate limit) → mostrar "Muchos intentos recientes, espera 30s" y **NO** grabar fallo.
   - Error de red / timeout / status desconocido → mostrar "Sin conexión con el servidor" y **NO** grabar fallo.
5. **Mensaje de bloqueo más útil**: cuando `is_locked`, incluir el nombre del admin de turno o instrucción explícita ("Pide desbloqueo en el panel Admin → Trabajadores").

### B) Aislar el login del service worker (`vite.config.ts`)

1. Excluir `/auth/*` y `/auth/v1/*` del navegación fallback: agregar a `navigateFallbackDenylist` y quitar cualquier ruta de Supabase Auth del `runtimeCaching`.
2. Cambiar el pattern de `runtimeCaching` para que **solo** cachee `/rest/v1/*` (datos) y **excluya** explícitamente `/auth/v1/*`, `/functions/v1/*` y `/realtime/v1/*`.
3. Reducir `maxAgeSeconds` de 300 → 60 para las respuestas cacheadas (el problema del "voy a ver datos viejos" cuando cambias de POS).
4. Agregar `skipWaiting: true` + `clientsClaim: true` en `workbox` para que el SW nuevo tome el control al primer refresh, no espere a cerrar todas las pestañas.

### C) Auto-reload cuando hay nueva versión (`src/main.tsx`)

Agregar un pequeño hook con `useRegisterSW` de `virtual:pwa-register/react` que, al detectar SW nuevo, muestre un toast "Nueva versión disponible" con botón "Actualizar" que llame `updateSW(true)`. Los tablets siempre encendidos dejan de arrastrar código viejo.

### D) Endpoint de diagnóstico (`record_login_attempt` + nueva columna)

Migración menor para poder ver qué está pasando en cada POS:

- Agregar columna `failure_reason text` a `public.login_attempts`.
- Modificar `record_login_attempt` para aceptar `p_failure_reason text DEFAULT NULL` (backwards compatible).
- Desde `Auth.tsx`, pasar el motivo real (`'invalid_pin' | 'rate_limit' | 'network' | 'locked'`). Solo `invalid_pin` cuenta para el bloqueo — cambiar `is_account_locked` para filtrar `WHERE (failure_reason IS NULL OR failure_reason = 'invalid_pin')` (el `NULL` preserva histórico).

Con esto podrás filtrar `SELECT rut_code, failure_reason, user_agent FROM login_attempts WHERE success=false` y ver de un vistazo qué POS específico está generando fallos y por qué.

### E) UX de "usar otro trabajador" (bonus rápido)

En `/auth`, si hay sesión activa, mostrar arriba del form un botón discreto **"Cambiar de trabajador"** que ejecuta `signOut()` y limpia el form. Hoy no existe una salida explícita — el operador queda en loop porque `handleExistingSession` lo rutea a `/admin` o `/sales` y no puede volver.

---

## Archivos que se tocan

| Archivo | Cambio |
|---|---|
| `src/pages/Auth.tsx` | Sanitización PIN, autoComplete off, signOut al montar, clasificación de errores, mensajes |
| `vite.config.ts` | Excluir Auth del SW, `skipWaiting`, `clientsClaim`, cache más corto y acotado a `/rest/v1/*` |
| `src/main.tsx` | Hook `useRegisterSW` con prompt de actualización |
| Nueva migración | `login_attempts.failure_reason` + `record_login_attempt` con parámetro opcional + `is_account_locked` filtrando por reason |

## Fuera de alcance
- No se cambia el modelo de sesión (Supabase sigue con JWT + refresh estándar).
- No se toca la lógica de roles ni jornadas.
- No se toca la impresión ni POS operativos.

## Cómo verificar tras el fix
1. En un POS "malo", entrar a /auth, verificar en DevTools → Application → Service Workers que se actualizó tras el reload.
2. Escribir un PIN con espacio al final → debe autenticar igual.
3. Simular red caída (DevTools → Offline) → debe decir "Sin conexión", **no** contar fallo.
4. En `admin_audit_logs` + `login_attempts.failure_reason`, revisar 24h después para confirmar que los bloqueos bajan.
