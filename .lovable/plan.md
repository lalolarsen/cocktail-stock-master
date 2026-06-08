
# Plan: STOCKIA dedicado a Berlín (single-venue oficial)

## Decisiones tomadas

- **Marca:** sigue siendo **STOCKIA**, pero la instancia es exclusiva de **Berlín Valdivia**. Internamente "venue" desaparece de la UI de usuario.
- **DB intacta:** mantenemos tabla `venues`, columnas `venue_id` y RLS actuales. Reversible en el futuro. Cero migraciones de datos.
- **Edge functions:** se quita el guard `enforcePilotVenue` (ya no tiene sentido), pero los inserts siguen escribiendo el `venue_id` constante.
- **Onboarding multi-venue:** se elimina. No habrá selector de venue, ni en developer panel.

---

## Alcance del cambio

### 1. UI: borrar el concepto "venue/local" del usuario final

- **Sidebar y headers:** quitar el `VenueIndicator` y `PilotBadge`. El header muestra solo "STOCKIA · Berlín".
- **Pantallas de jornada, dashboard, reportes:** sacar cualquier label "Local: Berlín", "Venue ID", "Pilot mode".
- **NoJornada, error screens:** texto neutro sin referencias a "tu local".
- **Developer panel:** ocultar `VenueSelector` y la pestaña que dependa de cambiar venue. Mantener el resto del panel intacto.

### 2. Centralizar el `venue_id` en un único punto

- `src/lib/venue.ts`: queda como **única fuente de verdad**. Se renombra `PILOT_VENUE_ID` → `BERLIN_VENUE_ID` (alias `VENUE_ID`). Se borra `PILOT_MODE`, `assertPilotVenue`, y los aliases `DEFAULT_*` se mantienen como re-exports para no romper imports.
- `AppSessionContext.tsx`: el venue sigue hardcodeado (ya lo está), pero limpiamos `venueError` y el código muerto de "no se pudo cargar el local".
- `VenueGuard.tsx`: se simplifica a un passthrough (o se elimina su uso en rutas).

### 3. Edge functions: quitar el guard pero conservar el ID

- `supabase/functions/_shared/pilot.ts` → renombrar a `venue.ts`, exporta `BERLIN_VENUE_ID`. Se elimina `enforcePilotVenue` (reemplazar las 3 llamadas por uso directo del ID).
- Funciones afectadas: `extract-invoice`, `create-worker-user`, `parse-invoice`. Siguen recibiendo `venue_id` del request por compatibilidad, pero ya no validan.

### 4. Hooks e inserts hardcodeados

- **NO se tocan.** Los ~100 sitios que hoy escriben `venue_id: DEFAULT_VENUE_ID` quedan así (correctos ahora que la app es oficialmente single-venue).
- Solo se actualiza el import si renombramos el símbolo.

### 5. Rebrand sutil

- Título de pestaña: `STOCKIA — Berlín`
- `index.html` meta description: incluir "Berlín Valdivia".
- Manifest PWA: nombre corto `STOCKIA Berlín`, ícono actual.
- Pantalla de login y splash: subtítulo "Berlín Valdivia".
- Footer y mails transaccionales: misma línea.

### 6. Limpieza de código muerto

- Borrar `assertPilotVenue` y sus call sites.
- Borrar `PILOT_MODE` y cualquier `if (PILOT_MODE)`.
- Borrar `VenueSelector` del developer panel y los tabs que lo consumían si quedan inservibles.
- Borrar `useActiveVenue` si solo retorna el constante (o simplificarlo a re-export).

### 7. Documentación

- Actualizar `README.md`: la app es oficialmente para Berlín; instrucciones para revertir a multi-venue si algún día se necesita.
- Actualizar memoria `Multi-tenant Isolation` → marcarla como obsoleta o reescribirla como "Single-venue: Berlín".

---

## Lo que NO se hace (explícito)

- ❌ No se eliminan columnas `venue_id` de las tablas.
- ❌ No se modifican las 226 políticas RLS.
- ❌ No se toca `get_user_venue_id()` ni la tabla `user_venue_roles`.
- ❌ No se tapan los 5 gaps de RLS (no es necesario con un solo venue).
- ❌ No se renombra la marca STOCKIA.
- ❌ No se borran las edge functions, solo se simplifican.

---

## Detalle técnico

**Archivos editados:**
- `src/lib/venue.ts` — quitar PILOT_MODE, renombrar exports, mantener aliases.
- `src/contexts/AppSessionContext.tsx` — limpiar lógica de error de venue.
- `src/components/VenueGuard.tsx` — simplificar o eliminar usos.
- `src/components/VenueIndicator.tsx`, `PilotBadge.tsx` — eliminar o vaciar.
- `src/components/AppSidebar.tsx`, headers de páginas — quitar referencias UI.
- `src/components/developer/*` — ocultar VenueSelector.
- `index.html`, `public/manifest.*` — rebrand.
- `supabase/functions/_shared/pilot.ts` → renombrado, sin guard.
- `supabase/functions/{extract-invoice,create-worker-user,parse-invoice}/index.ts` — remover `enforcePilotVenue`.
- `README.md` — actualizar.
- `mem://architecture/enforced-multi-tenant-isolation` — actualizar a single-venue.

**Migraciones DB:** ninguna.

**Estimación:** 1 sesión de trabajo (cambios mecánicos, sin lógica nueva).

---

## Riesgo

Muy bajo. Todos los cambios son cosméticos o de eliminación de guards. El comportamiento operativo (jornadas, ventas, stock, redenciones) no cambia.
