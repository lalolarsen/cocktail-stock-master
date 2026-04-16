

# Plan: Medio de pago obligatorio sin preselección

## Resumen

Eliminar la preselección de "Tarjeta" como medio de pago. Ambas cajas (normal e híbrida) arrancarán sin ningún método seleccionado. El botón "Cobrar" quedará deshabilitado hasta que el usuario elija explícitamente Efectivo o Tarjeta. Después de cada venta procesada, el estado se resetea a "sin selección".

## Cambios en `src/pages/Sales.tsx`

1. **Estado inicial sin selección**: Cambiar `useState<"cash" | "card">("card")` a `useState<"cash" | "card" | null>(null)`
2. **Deshabilitar botón Cobrar**: Agregar `!paymentMethod` a la condición `disabled` del botón (línea 1288)
3. **Reset post-venta**: Agregar `setPaymentMethod(null)` en el flujo de limpieza después de procesar la venta exitosamente
4. **UI de selección**: Adaptar los botones de Efectivo/Tarjeta para que ninguno aparezca activo cuando `paymentMethod === null`, y agregar un indicador visual (texto rojo sutil) cuando el carrito tiene items pero no se ha seleccionado medio de pago
5. **Guard en `processSale`**: Agregar validación temprana que muestre toast de error si `paymentMethod` es null

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/Sales.tsx` | Estado nullable, disable botón, reset post-venta, indicador visual |

## Actualizar memoria

Actualizar `mem://features/sales/pos-ui-preferences` para reflejar que ya no hay medio de pago por defecto.

