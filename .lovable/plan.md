

# Plan: Mejora del Módulo de Trabajadores

## Resumen

Optimizar visualmente el módulo de Trabajadores, implementar filtrado por rol según el usuario actual (Admin ve staff, Gerencia ve gerencia+admin), y controlar la visibilidad de credenciales (Admin ve RUT completo, Gerencia ve RUT enmascarado).

## Cambios

### 1. Filtrado de usuarios por rol del viewer (`WorkersManagementNew.tsx`)

**Admin** (`role === "admin"`): solo ve usuarios con roles de staff — `vendedor`, `bar`, `ticket_seller`, y otros `admin`. No ve `gerencia` ni `developer`.

**Gerencia** (`role === "gerencia"`): ve usuarios con rol `gerencia` y `admin`. No ve staff operativo.

Se aplica el filtro después de `fetchWorkers`, antes del render.

### 2. Visibilidad de credenciales según rol

- **Admin**: `maskRut` devuelve el RUT completo (sin enmascarar)
- **Gerencia** (`isReadOnly`): `maskRut` sigue enmascarando (`***XXXX`)

Se pasa el `role` actual al componente y se condiciona la función `maskRut`.

### 3. Optimización visual completa

Rediseño del módulo usando cards en grid en lugar de tabla para mejor UX:

- **Cards con avatar** generado por iniciales, indicador de estado (activo/inactivo)
- **Badges de rol** con colores e iconos (ya existe la lógica)
- **Acciones contextuales** en cada card con iconos compactos
- **Stats header** con contadores por rol (resumen visual)
- **Búsqueda y filtros** rediseñados con layout limpio
- **Responsive**: 1 columna mobile, 2 tablet, 3 desktop

### 4. Pasar rol del viewer desde Admin.tsx

Actualmente se pasa `isReadOnly`. Se agregará también el `role` para que el componente filtre y muestre credenciales según corresponda.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/WorkersManagementNew.tsx` | Rediseño visual (cards grid), filtrado por rol del viewer, maskRut condicional |
| `src/pages/Admin.tsx` | Pasar `role` como prop a `WorkersManagementNew` |

## Sin cambios de DB

Todo es lógica de frontend y filtrado client-side.

