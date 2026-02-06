# Manual Completo de DiStock

## Índice

1. [Introducción](#1-introducción)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Sistema de Autenticación](#3-sistema-de-autenticación)
4. [Roles y Permisos](#4-roles-y-permisos)
5. [Módulos por Rol](#5-módulos-por-rol)
6. [Reglas de Negocio](#6-reglas-de-negocio)
7. [Funcionalidades Detalladas](#7-funcionalidades-detalladas)
8. [Flujos Operacionales](#8-flujos-operacionales)
9. [Glosario](#9-glosario)

---

## 1. Introducción

**DiStock** (también conocido como CoctelStock) es un sistema integral de gestión para bares y discotecas que implementa una metodología única de control de inventario donde el stock se descuenta **al momento de entrega en barra** (no al momento de la venta). 

### Filosofía Central: "Método DiStock"
- **Diferimiento de Stock**: El inventario no se descuenta cuando el cliente paga, sino cuando el bartender entrega el producto y escanea el QR.
- **Validación en el Último Punto**: Los mixers y opciones se confirman en barra, permitiendo flexibilidad operacional.
- **Multi-Stock**: Una venta puede afectar múltiples productos de inventario (ej: cóctel con varios ingredientes).

---

## 2. Arquitectura del Sistema

### 2.1 Multi-Tenant
El sistema está diseñado para múltiples venues (locales) con **aislamiento total por `venue_id`**:
- Cada venue tiene sus propios productos, trabajadores, jornadas y configuración.
- Las políticas RLS (Row Level Security) garantizan que los usuarios solo accedan a datos de su venue.

### 2.2 Ubicaciones de Stock
```
┌─────────────────────────────────────────────────────────────┐
│                    PROVEEDOR                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ (Ingreso de Stock)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               BODEGA PRINCIPAL (Warehouse)                   │
│  • Almacena todo el inventario central                       │
│  • Valorización por Costo Promedio Ponderado (CPP)           │
└─────────────────────┬───────────────────────────────────────┘
                      │ (Reposición)
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     ┌─────────┐ ┌─────────┐ ┌─────────┐
     │ Barra 1 │ │ Barra 2 │ │ Barra N │
     └────┬────┘ └────┬────┘ └────┬────┘
          │           │           │
          └───────────┴───────────┘
                      │ (Consumo al escanear QR)
                      ▼
                  [CLIENTE]
```

### 2.3 Terminales POS
- **Caja Alcohol** (`pos_type: alcohol_sales`): Ventas de bebidas
- **Caja Entradas** (`pos_type: ticket_sales`): Venta de tickets/covers

---

## 3. Sistema de Autenticación

### 3.1 Login de Trabajadores
**Ruta**: `/auth`

**Credenciales**:
- **RUT**: Número de identificación (7-9 dígitos sin puntos ni guión)
- **PIN**: Contraseña numérica (mínimo 6 caracteres)

**Proceso**:
1. Usuario ingresa RUT y PIN
2. Sistema valida credenciales contra `profiles.rut_code` y autenticación Supabase
3. Si tiene múltiples roles, muestra pantalla de selección de modo
4. Redirección según rol seleccionado

### 3.2 Cuentas Demo
- Formato: `DEMO-XXX`
- Usadas para demostración y pruebas

### 3.3 Bloqueo de Cuenta
- Tras múltiples intentos fallidos, la cuenta se bloquea temporalmente (15 minutos)
- Registrado en `login_attempts` para auditoría

---

## 4. Roles y Permisos

### 4.1 Tipos de Roles

| Rol | Código | Descripción |
|-----|--------|-------------|
| **Administrador** | `admin` | Control total del sistema |
| **Gerencia** | `gerencia` | Solo lectura de reportes y datos |
| **Vendedor** | `vendedor` | Opera las cajas de venta |
| **Bartender** | `bar` | Escanea QRs y entrega productos |
| **Vendedor Tickets** | `ticket_seller` | Vende entradas/covers |
| **Desarrollador** | `developer` | Acceso a herramientas de diagnóstico |

### 4.2 Matriz de Permisos

| Funcionalidad | Admin | Gerencia | Vendedor | Bartender | Ticket Seller |
|--------------|:-----:|:--------:|:--------:|:---------:|:-------------:|
| Ver Panel General | ✅ | ✅ (solo lectura) | ❌ | ❌ | ❌ |
| Gestionar Jornadas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Abrir/Cerrar Jornada | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver Inventario | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modificar Inventario | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear Trabajadores | ✅ | ❌ | ❌ | ❌ | ❌ |
| Vender Bebidas | ✅ | ❌ | ✅ | ❌ | ❌ |
| Vender Tickets | ✅ | ❌ | ✅ | ❌ | ✅ |
| Escanear QRs | ❌ | ❌ | ❌ | ✅ | ❌ |
| Ver Reportes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reposición Barras | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar POS | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Módulos por Rol

### 5.1 Administrador (`/admin`)

#### Navegación Sidebar

| Menú | Icono | Descripción |
|------|-------|-------------|
| **Panel General** | Wine | Dashboard con estadísticas en tiempo real |
| **Jornadas** | Calendar | Gestión de turnos operacionales |
| **Puntos de Venta** | Receipt | Configuración de terminales POS y barras |
| **Inventario** | Warehouse | Stock en bodega principal |
| **Reposición** | ArrowRightLeft | Envío de stock a barras |
| **Carta** | Martini | Menú de cócteles y recetas |
| **Trabajadores** | Users | Gestión de personal |
| **Reportes** | FileText | Informes y análisis |

#### Panel General (Overview)
**Tarjetas de Estado**:
- **Jornada**: Estado actual (Activa/Cerrada/Sin jornada)
- **Ingresos Brutos**: Total del día
- **Ventas**: Monto y cantidad de transacciones
- **QRs Canjeados**: Códigos escaneados hoy
- **Barras**: Estado de stock de cada barra

**Alertas**:
- Ventas huérfanas (sin jornada asignada)
- Stock bajo en barras

**Gráficos en Tiempo Real**:
- Ventas por hora
- Productos más vendidos
- Desglose COGS (Cost of Goods Sold)

---

### 5.2 Vendedor - Caja Alcohol (`/sales`)

#### Flujo de Venta

```
1. SELECCIÓN DE POS
   └── Elegir terminal de venta asignado

2. INTERFAZ DE VENTA
   ├── Grilla de productos por categoría
   ├── Filtros horizontales (Todos, Cócteles, Shots, etc.)
   ├── Sección "Más Vendidos"
   └── Carrito lateral

3. PROCESO DE VENTA
   ├── Agregar productos al carrito (click o tap)
   ├── Modificar cantidades (+/-)
   ├── Seleccionar add-ons (opcional)
   ├── Elegir método de pago (Efectivo/Tarjeta)
   └── Confirmar venta (Enter o botón)

4. POST-VENTA
   ├── Generación de QR para retiro
   ├── Mostrar código de venta
   └── Reset automático para siguiente venta
```

#### Elementos de la Interfaz

| Elemento | Función |
|----------|---------|
| **Grilla de Productos** | Muestra cócteles/bebidas disponibles con precio |
| **Carrito** | Lista de items agregados con cantidad y subtotal |
| **Botón +/-** | Aumentar/disminuir cantidad de item |
| **Botón Eliminar** | Quitar item del carrito |
| **Selector Método Pago** | Efectivo (interno) o Tarjeta (POS externo) |
| **Tipo Documento** | Boleta (default) o Factura |
| **Botón Cobrar** | Procesa la venta y genera QR |
| **Pantalla Éxito** | Muestra QR para cliente con temporizador |

#### Reglas de Venta
- ⚠️ **Requiere jornada activa** para vender
- El stock NO se descuenta al vender (solo al canjear QR)
- Los QRs tienen expiración (configurada por jornada)

---

### 5.3 Vendedor Tickets (`/tickets`)

#### Flujo de Venta de Entradas

```
1. SELECCIÓN DE POS
   └── Elegir caja de tickets asignada

2. SELECCIÓN DE ENTRADAS
   ├── Lista de tipos de entrada disponibles
   ├── Precio por tipo
   └── Indicador de cover incluido

3. CARRITO
   ├── Cantidad por tipo de entrada
   ├── Total de covers a generar
   └── Total a cobrar

4. PAGO
   ├── Seleccionar método (Efectivo/Tarjeta)
   └── Confirmar venta

5. GENERACIÓN DE QRs
   ├── Un QR por cada cover incluido
   └── Pantalla de éxito con todos los QRs
```

#### Tipos de Entrada
- **Con Cover**: Incluye bebida(s) canjeables en barra
- **Sin Cover**: Solo entrada al venue
- **Cantidad Variable**: Diferentes cantidades de covers por tipo

---

### 5.4 Bartender (`/bar`)

#### Interfaz de Escaneo

```
┌────────────────────────────────────────┐
│          SELECCIÓN DE BARRA            │
│    ┌────────┐  ┌────────┐              │
│    │ Barra 1│  │ Barra 2│              │
│    └────────┘  └────────┘              │
└────────────────────────────────────────┘
                 ↓
┌────────────────────────────────────────┐
│          MODO DE ESCANEO               │
│    ○ Lector USB    ○ Cámara            │
└────────────────────────────────────────┘
                 ↓
┌────────────────────────────────────────┐
│           PANTALLA PRINCIPAL           │
│                                        │
│   ┌────────────────────────────────┐   │
│   │                                │   │
│   │      ÁREA DE ESCANEO           │   │
│   │      (Cámara o Input USB)      │   │
│   │                                │   │
│   └────────────────────────────────┘   │
│                                        │
│   ┌────────────────────────────────┐   │
│   │     HISTORIAL DE ESCANEOS      │   │
│   │  ✅ VEN-001 - Ron + Cola       │   │
│   │  ✅ VEN-002 - Whisky Sour      │   │
│   │  ❌ VEN-003 - Ya canjeado      │   │
│   └────────────────────────────────┘   │
└────────────────────────────────────────┘
```

#### Modos de Lectura

| Modo | Descripción | Uso Recomendado |
|------|-------------|-----------------|
| **USB Scanner** | Lector de códigos externo | Operación rápida en barra fija |
| **Cámara** | Cámara del dispositivo | Dispositivos móviles |

#### Resultados de Escaneo

| Estado | Color | Significado | Acción |
|--------|-------|-------------|--------|
| **SUCCESS** | 🟢 Verde | Canje exitoso | Entregar producto |
| **ALREADY_REDEEMED** | 🔴 Rojo | Ya fue canjeado | Rechazar |
| **EXPIRED** | 🟠 Naranja | QR vencido | Rechazar |
| **CANCELLED** | 🔴 Rojo | Venta cancelada | Rechazar |
| **INSUFFICIENT_STOCK** | 🟡 Amarillo | Sin stock en barra | Reponer o rechazar |

#### Selección de Mixer
Si la receta tiene "slot de mixer" (bebida a elegir):
1. Aparece diálogo de selección
2. Bartender elige el mixer
3. Stock se descuenta del mixer elegido

---

### 5.5 Gerencia (`/admin` - Solo Lectura)

#### Acceso Limitado a:
- Panel General (solo visualización)
- Reportes
- Inventario (visualización)
- Estado de Resultados
- Auditoría de retiros

---

## 6. Reglas de Negocio

### 6.1 Ley de Costos
```
REGLA ABSOLUTA: Todo producto debe tener un costo unitario >= 0
```
- No se puede ingresar stock sin datos de costo
- El costo se usa para calcular COGS y margen bruto

### 6.2 Costo Promedio Ponderado (CPP)
Método exclusivo de valorización de inventario:
```
nuevo_cpp = (stock_actual × costo_actual + unidades_nuevas × costo_nuevo) 
            / (stock_actual + unidades_nuevas)
```

**El costo unitario neto considera**:
- ✅ Precio sin IVA
- ❌ Sin impuestos específicos (ILA/IABA)
- ❌ Sin flete (se registra como gasto operacional)
- ✅ Después de descuentos prorrateados

### 6.3 Jornadas

**Definición**: Período operacional que agrupa todas las transacciones.

| Estado | Descripción |
|--------|-------------|
| `activa` | Jornada en curso, permite ventas |
| `cerrada` | Jornada finalizada con arqueo |

**Reglas**:
- Solo puede haber **UNA jornada activa** por venue
- Las ventas **requieren** jornada activa
- El cierre incluye arqueo de caja obligatorio (excepto cierre forzado)
- Jornadas abiertas por más de 24 horas se marcan como "obsoletas"

### 6.4 Flujo de Stock

```
[Compra] → [Bodega] → [Reposición] → [Barra] → [Consumo al canjear QR]
```

**Consumos por tipo de producto**:
| Tipo | Consumo por Servicio |
|------|---------------------|
| Destilado (trago largo) | 90ml + 1 mixer |
| Shot | 45ml |
| Cerveza/Botellín | 1 unidad |
| Botella 750ml | 1 unidad |

### 6.5 QR y Tokens de Retiro

**Ciclo de vida**:
```
issued → [Escaneo exitoso] → redeemed
         [Tiempo excedido] → expired
         [Venta cancelada] → cancelled
```

**Validaciones al escanear**:
1. Token existe y es válido
2. Venta no está cancelada
3. Token no ha sido canjeado
4. Token no ha expirado
5. Hay stock suficiente en la barra

---

## 7. Funcionalidades Detalladas

### 7.1 Gestión de Jornadas

#### Botón: "Abrir Jornada"
**Acción**: Inicia nueva jornada con apertura de caja

**Diálogo de Apertura**:
- Selección de POS
- Monto de apertura de caja por POS
- Nota de apertura (opcional)

#### Botón: "Cerrar Jornada"
**Acción**: Inicia proceso de arqueo

**Proceso de Arqueo**:
1. Muestra ventas en efectivo esperadas
2. Input para dinero contado
3. Cálculo automático de diferencia
4. Notas de cierre
5. Generación de resumen financiero

#### Botón: "Forzar Cierre"
**Acción**: Cierra jornada sin arqueo (solo emergencias)
- Requiere confirmación
- Se registra en auditoría
- No genera resumen financiero

---

### 7.2 Inventario de Bodega

#### Vista Principal
- Lista de todos los productos con stock en bodega
- Filtro por subcategoría
- Búsqueda por nombre/código
- Indicadores de estado (OK, Bajo, Crítico, Agotado)

#### Tarjetas de Estadísticas
- **Productos con stock**: Total de productos > 0
- **Stock bajo**: Productos bajo mínimo
- **Sin stock**: Productos agotados
- **Valor total**: Valorización del inventario

#### Ingreso de Stock
**Botón**: "Ingresar Stock"
- Selección de producto
- Cantidad a ingresar
- Costo unitario (actualiza CPP)
- Generación de movimiento de entrada

---

### 7.3 Reposición de Barras

#### Transferencia Rápida
1. Seleccionar barra destino
2. Buscar producto
3. Ingresar cantidad
4. Confirmar envío

**Validaciones**:
- No puede exceder stock en bodega
- Genera movimiento de salida (bodega) y entrada (barra)

#### Planes de Reposición
- Crear plan con múltiples items
- Estados: Borrador → Aplicado
- Validación de stock antes de aplicar

---

### 7.4 Gestión de Carta (Menú)

#### Crear Cóctel
- Nombre y categoría
- Precio de venta
- Receta (ingredientes y cantidades)
- Slots de mixer (opciones dinámicas)
- Add-ons disponibles

#### Recetas
```
Ejemplo: Whisky Sour
├── Whisky: 90ml
├── Limón: 30ml
├── Azúcar: 15ml
└── [Opcional] Espuma de huevo
```

---

### 7.5 Gestión de Trabajadores

#### Crear Trabajador
**Campos**:
- Nombre completo
- RUT (identificación)
- Email (opcional)
- PIN (mínimo 6 caracteres)
- Roles asignados (múltiples)

**Proceso**:
1. Admin completa formulario
2. Sistema genera email interno: `{rut}@distock.local`
3. Se crea usuario en Supabase Auth
4. Se asignan roles en `worker_roles`

#### Estados
- **Activo**: Puede iniciar sesión
- **Inactivo**: Bloqueado (se oculta en sección colapsable)

---

### 7.6 Puntos de Venta (POS)

#### Tipos de POS
| Tipo | Código | Uso |
|------|--------|-----|
| Caja Alcohol | `alcohol_sales` | Ventas de bebidas |
| Caja Tickets | `ticket_sales` | Ventas de entradas |

#### Configuración
- Nombre del POS
- Tipo de negocio
- ¿Es caja registradora? (habilita arqueo)
- Estado (activo/inactivo)

---

### 7.7 Reportes

#### Tipos de Reportes
- **Ventas por período**: Desglose por día/semana/mes
- **Productos más vendidos**: Ranking de cócteles
- **COGS**: Costo de productos vendidos
- **Margen bruto**: Ingresos vs costos
- **Estado de Resultados**: P&L del período

---

## 8. Flujos Operacionales

### 8.1 Inicio de Operaciones (Día Típico)

```
1. ADMIN abre jornada
   ├── Define monto de apertura de caja
   └── Registra hora de apertura

2. VENDEDORES inician sesión
   ├── Seleccionan modo (Alcohol/Tickets)
   └── Eligen su POS asignado

3. BARTENDERS inician sesión
   ├── Seleccionan su barra
   └── Eligen modo de lectura (USB/Cámara)

4. OPERACIÓN NORMAL
   ├── Vendedores procesan ventas
   ├── Generan QRs para clientes
   ├── Bartenders escanean y entregan
   └── Stock se descuenta automáticamente
```

### 8.2 Cierre de Operaciones

```
1. ADMIN inicia cierre de jornada
   
2. ARQUEO DE CAJA (por cada POS con caja)
   ├── Sistema calcula efectivo esperado
   ├── Admin ingresa efectivo contado
   ├── Se registra diferencia
   └── Notas de cierre

3. GENERACIÓN DE RESUMEN
   ├── Ventas brutas/netas
   ├── Gastos operacionales
   ├── COGS
   ├── Resultado operacional
   └── Balance de caja

4. CIERRE
   └── Estado cambia a "cerrada"
```

### 8.3 Flujo de Compra → Venta → Consumo

```
COMPRA
│
├─→ Ingreso de factura (manual o lector)
├─→ Validación de datos
├─→ Actualización de CPP
└─→ Stock aumenta en BODEGA

REPOSICIÓN  
│
├─→ Admin crea transferencia
├─→ Stock sale de BODEGA
└─→ Stock entra a BARRA específica

VENTA
│
├─→ Vendedor agrega items al carrito
├─→ Cliente paga
├─→ Se genera QR
└─→ [Stock NO cambia todavía]

CANJE (Momento de consumo real)
│
├─→ Bartender escanea QR
├─→ Sistema valida token
├─→ Descuenta stock de BARRA
├─→ Registra COGS con costo vigente
└─→ Token marcado como "redeemed"
```

---

## 9. Glosario

| Término | Definición |
|---------|------------|
| **Venue** | Local/establecimiento individual en el sistema |
| **Jornada** | Período operacional (turno) que agrupa transacciones |
| **POS** | Point of Sale - Terminal de venta |
| **Token de Retiro** | Código QR generado para canjear productos en barra |
| **CPP** | Costo Promedio Ponderado - Método de valorización |
| **COGS** | Cost of Goods Sold - Costo de productos vendidos |
| **Mixer** | Bebida complementaria en un cóctel (ej: cola, sprite) |
| **Add-on** | Modificador sin impacto en inventario (ej: extra hielo) |
| **Arqueo** | Proceso de conteo y conciliación de caja |
| **Reposición** | Transferencia de stock de bodega a barra |
| **Diferimiento** | El stock se descuenta al entregar, no al vender |
| **Cover** | Bebida incluida con la entrada |
| **RLS** | Row Level Security - Seguridad a nivel de fila en BD |
| **Feature Flag** | Bandera que habilita/deshabilita funcionalidades |

---

## Anexo A: Atajos de Teclado

### Módulo de Ventas
| Tecla | Acción |
|-------|--------|
| `Enter` | Confirmar venta (si carrito no vacío) |
| `Escape` | Mostrar confirmación para limpiar carrito |

### Módulo de Tickets
| Tecla | Acción |
|-------|--------|
| `Enter` | Confirmar venta de tickets |

### Módulo de Bar
| Tecla | Acción |
|-------|--------|
| `Enter` | Procesar QR escaneado (modo USB) |

---

## Anexo B: Códigos de Error de QR

| Código | Mensaje Usuario | Causa |
|--------|-----------------|-------|
| `SUCCESS` | ✅ Entregar | Canje exitoso |
| `ALREADY_REDEEMED` | Ya canjeado | Token usado previamente |
| `TOKEN_EXPIRED` | Expirado | Tiempo límite excedido |
| `SALE_CANCELLED` | Venta cancelada | La venta fue anulada |
| `INSUFFICIENT_BAR_STOCK` | Sin stock | Barra no tiene el producto |
| `TOKEN_NOT_FOUND` | No encontrado | Token inválido o inexistente |
| `PAYMENT_NOT_CONFIRMED` | Pago no confirmado | Estado de pago pendiente |
| `WRONG_BAR` | Barra incorrecta | Token asignado a otra barra |

---

## Anexo C: Estados de Documentos

### Boletas/Facturas
| Estado | Descripción |
|--------|-------------|
| `pending` | Pendiente de emisión |
| `issued` | Emitida correctamente |
| `failed` | Error en emisión (reintentable) |
| `skipped` | Omitida (pago con tarjeta en modo híbrido) |

---

*Última actualización: Febrero 2026*
*Versión del documento: 1.0*
