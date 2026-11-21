# Verificación del acceso y flujos

- Acceso real con RUT y contraseña de un vendedor temporal: selección de Alcohol, Entradas y Guardarropía visible.
- Recuperación de sesión existente: administrador a Administración; vendedor conserva selección de modo.
- Cambio de trabajador: sesión finalizada y rutas protegidas inaccesibles hasta nuevo acceso.
- PIN: cambio desde la pantalla de Trabajadores responde correctamente y permite acceso con el nuevo PIN; vendedor recibe rechazo 403.
- Administración, catálogos de Alcohol y Entradas, historial de entradas, Guardarropía y Ayuda de Cortesías abiertos con datos existentes.
- Descargas reales: productos vendidos PDF, cortesías PDF y CSV de ventas de jornada #157.
- Resumen de Guardarropía: ventana imprimible con total $70.000, 45 operaciones, 8 mochilas, 54 prendas y campos de firma/nombre/RUT.
- Pantalla de acceso verificada a 695 × 779; pruebas de escritorio a 1280 × 1800.
- Última verificación: sin errores de ejecución; único error HTTP esperado: rechazo 403 al cambio de PIN por vendedor.
- Nueve pruebas automatizadas aprobadas; compilación de vista previa correcta.

No se generaron ventas ni cortesías, ni se cerró la jornada. Impresión física, cobro completo, correo de cierre y extracción de una factura nueva no se probaron en esta revisión.