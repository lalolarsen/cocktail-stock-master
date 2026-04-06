/**
 * Excel-First Inventory Parser
 *
 * Parses the unified inventory template (Plantilla_Unica) with 3 movement types:
 * COMPRA, TRANSFERENCIA, CONTEO.
 *
 * Resolves sku_base → product_id via products.code (case-insensitive)
 * Resolves ubicacion → location_id via stock_locations.name (case-insensitive)
 */

import * as XLSX from "xlsx";
import { isBottle } from "@/lib/product-type";

// ── Types ────────────────────────────────────────────────────────────────────

export type MovementType = "COMPRA" | "TRANSFERENCIA" | "CONTEO";
export type ConsumoType = "ML" | "UNIT";

export interface ExcelInventoryRow {
  rowIndex: number;
  tipo_movimiento: MovementType | string;
  fecha: string;
  documento_ref: string;
  proveedor: string;
  ubicacion_origen: string;
  ubicacion_destino: string;
  sku_base: string;
  producto_nombre: string;
  tipo_consumo: ConsumoType | string;
  unidad_base: string;
  formato_compra_ml: number | null;
  cantidad_envases: number | null;
  cantidad_base_movida: number | null;
  cantidad_base_calculada: number | null;
  costo_neto_envase: number | null;
  valor_neto_linea: number | null;
  cpp_base_calculado: number | null;
  stock_teorico_exportado: number | null;
  stock_real_contado: number | null;
  motivo_ajuste: string;
  observaciones: string;
}

export interface ResolvedRow extends ExcelInventoryRow {
  productId: string | null;
  locationOrigenId: string | null;
  locationDestinoId: string | null;
  computedBaseQty: number;
  errors: string[];
  isValid: boolean;
}

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export interface ParseResult {
  rows: ResolvedRow[];
  errors: ValidationError[];
  summary: {
    compras: number;
    transferencias: number;
    conteos: number;
    valid: number;
    invalid: number;
  };
}

export interface ProductRef {
  id: string;
  code: string;
  name: string;
  capacity_ml: number | null;
  cost_per_unit: number;
  current_stock: number;
}

export interface LocationRef {
  id: string;
  name: string;
  type: string;
}

// ── Column mapping ───────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ExcelInventoryRow> = {
  tipo_movimiento: "tipo_movimiento",
  fecha: "fecha",
  documento_ref: "documento_ref",
  proveedor: "proveedor",
  ubicacion_origen: "ubicacion_origen",
  ubicacion_destino: "ubicacion_destino",
  sku_base: "sku_base",
  producto_nombre: "producto_nombre",
  tipo_consumo: "tipo_consumo",
  unidad_base: "unidad_base",
  formato_compra_ml: "formato_compra_ml",
  cantidad_envases: "cantidad_envases",
  cantidad_base_movida: "cantidad_base_movida",
  cantidad_base_calculada: "cantidad_base_calculada",
  costo_neto_envase: "costo_neto_envase",
  valor_neto_linea: "valor_neto_linea",
  cpp_base_calculado: "cpp_base_calculado",
  stock_teorico_exportado: "stock_teorico_exportado",
  stock_real_contado: "stock_real_contado",
  motivo_ajuste: "motivo_ajuste",
  observaciones: "observaciones",
};

// ── Parser ───────────────────────────────────────────────────────────────────

export function parseExcelInventory(
  fileData: ArrayBuffer,
  products: ProductRef[],
  locations: LocationRef[],
  balances: Map<string, number>, // key = `${productId}::${locationId}` → quantity
): ParseResult {
  const workbook = XLSX.read(fileData);

  // Try to find "Plantilla_Unica" sheet, fallback to first sheet
  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase().includes("plantilla")) ||
    workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  // Build lookup maps
  const productByCode = new Map<string, ProductRef>();
  products.forEach((p) => {
    if (p.code) productByCode.set(p.code.toLowerCase().trim(), p);
  });

  const locationByName = new Map<string, LocationRef>();
  locations.forEach((l) => {
    locationByName.set(l.name.toLowerCase().trim(), l);
  });

  const errors: ValidationError[] = [];
  const resolved: ResolvedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 2; // Excel row (1-indexed + header)

    // Map columns (case-insensitive key match)
    const row = mapRawRow(raw, rowIndex);

    // Skip empty rows
    if (!row.tipo_movimiento && !row.sku_base) continue;

    const tipo = row.tipo_movimiento.toUpperCase().trim() as MovementType;
    if (!["COMPRA", "TRANSFERENCIA", "CONTEO"].includes(tipo)) {
      errors.push({ rowIndex, field: "tipo_movimiento", message: `Tipo inválido: "${row.tipo_movimiento}"` });
      resolved.push({ ...row, productId: null, locationOrigenId: null, locationDestinoId: null, computedBaseQty: 0, errors: [`Tipo inválido`], isValid: false });
      continue;
    }

    const rowErrors: string[] = [];

    // Resolve product
    const sku = (row.sku_base || "").toLowerCase().trim();
    const product = sku ? productByCode.get(sku) : null;
    if (!sku) {
      rowErrors.push("SKU vacío");
      errors.push({ rowIndex, field: "sku_base", message: "SKU vacío" });
    } else if (!product) {
      rowErrors.push(`SKU "${row.sku_base}" no encontrado`);
      errors.push({ rowIndex, field: "sku_base", message: `SKU "${row.sku_base}" no encontrado` });
    }

    // Determine tipo_consumo from product if not specified
    const tipoConsumo: ConsumoType =
      row.tipo_consumo?.toUpperCase().trim() === "UNIT"
        ? "UNIT"
        : row.tipo_consumo?.toUpperCase().trim() === "ML"
          ? "ML"
          : product
            ? isBottle(product) ? "ML" : "UNIT"
            : "UNIT";

    // Resolve locations
    const locOrigen = row.ubicacion_origen
      ? locationByName.get(row.ubicacion_origen.toLowerCase().trim()) || null
      : null;
    const locDestino = row.ubicacion_destino
      ? locationByName.get(row.ubicacion_destino.toLowerCase().trim()) || null
      : null;

    // Validate per type
    let computedBaseQty = 0;

    if (tipo === "COMPRA") {
      if (!locDestino && row.ubicacion_destino) {
        rowErrors.push(`Ubicación destino "${row.ubicacion_destino}" no encontrada`);
      } else if (!row.ubicacion_destino) {
        rowErrors.push("Ubicación destino requerida");
      }

      const cantEnvases = toNum(row.cantidad_envases);
      const costoEnvase = toNum(row.costo_neto_envase);

      if (!cantEnvases || cantEnvases <= 0) {
        rowErrors.push("Cantidad envases requerida > 0");
      }
      if (costoEnvase === null || costoEnvase < 0) {
        rowErrors.push("Costo neto envase requerido");
      }

      if (tipoConsumo === "ML") {
        const formato = toNum(row.formato_compra_ml);
        if (!formato || formato <= 0) {
          rowErrors.push("Formato compra ML requerido para tipo ML");
        } else {
          computedBaseQty = (cantEnvases || 0) * formato;
        }
      } else {
        computedBaseQty = cantEnvases || 0;
      }
    } else if (tipo === "TRANSFERENCIA") {
      if (!locOrigen && row.ubicacion_origen) {
        rowErrors.push(`Ubicación origen "${row.ubicacion_origen}" no encontrada`);
      } else if (!row.ubicacion_origen) {
        rowErrors.push("Ubicación origen requerida");
      }
      if (!locDestino && row.ubicacion_destino) {
        rowErrors.push(`Ubicación destino "${row.ubicacion_destino}" no encontrada`);
      } else if (!row.ubicacion_destino) {
        rowErrors.push("Ubicación destino requerida");
      }

      computedBaseQty = toNum(row.cantidad_base_movida) || 0;
      if (computedBaseQty <= 0) {
        rowErrors.push("Cantidad base movida requerida > 0");
      }

      // Check sufficient stock at origin
      if (product && locOrigen && computedBaseQty > 0) {
        const key = `${product.id}::${locOrigen.id}`;
        const currentBalance = balances.get(key) || 0;
        if (computedBaseQty > currentBalance) {
          rowErrors.push(`Stock insuficiente en origen (disponible: ${currentBalance})`);
        }
      }
    } else if (tipo === "CONTEO") {
      if (!locDestino && row.ubicacion_destino) {
        rowErrors.push(`Ubicación "${row.ubicacion_destino}" no encontrada`);
      } else if (!row.ubicacion_destino) {
        rowErrors.push("Ubicación requerida");
      }

      const stockReal = toNum(row.stock_real_contado);
      if (stockReal === null || stockReal < 0) {
        rowErrors.push("Stock real contado requerido ≥ 0");
      }
      computedBaseQty = stockReal || 0;
    }

    rowErrors.forEach((msg) => {
      if (!errors.find((e) => e.rowIndex === rowIndex && e.message === msg)) {
        errors.push({ rowIndex, field: "general", message: msg });
      }
    });

    resolved.push({
      ...row,
      tipo_movimiento: tipo,
      tipo_consumo: tipoConsumo,
      productId: product?.id || null,
      locationOrigenId: locOrigen?.id || null,
      locationDestinoId: locDestino?.id || null,
      computedBaseQty,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    });
  }

  const compras = resolved.filter((r) => r.tipo_movimiento === "COMPRA");
  const transferencias = resolved.filter((r) => r.tipo_movimiento === "TRANSFERENCIA");
  const conteos = resolved.filter((r) => r.tipo_movimiento === "CONTEO");

  return {
    rows: resolved,
    errors,
    summary: {
      compras: compras.length,
      transferencias: transferencias.length,
      conteos: conteos.length,
      valid: resolved.filter((r) => r.isValid).length,
      invalid: resolved.filter((r) => !r.isValid).length,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapRawRow(raw: Record<string, any>, rowIndex: number): ExcelInventoryRow {
  const mapped: any = { rowIndex };

  // Normalize raw keys to match COLUMN_MAP
  const normalizedRaw = new Map<string, any>();
  Object.entries(raw).forEach(([key, val]) => {
    normalizedRaw.set(key.toLowerCase().trim(), val);
  });

  Object.entries(COLUMN_MAP).forEach(([excelKey, fieldName]) => {
    const val = normalizedRaw.get(excelKey.toLowerCase());
    mapped[fieldName] = val !== undefined ? val : "";
  });

  return mapped as ExcelInventoryRow;
}

function toNum(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ── Template generator ───────────────────────────────────────────────────────

export function generateTemplate(
  products: ProductRef[],
  locations: LocationRef[],
  balances: { productId: string; locationId: string; quantity: number }[],
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Plantilla_Unica (empty template)
  const headers = [
    "tipo_movimiento", "fecha", "documento_ref", "proveedor",
    "ubicacion_origen", "ubicacion_destino", "sku_base", "producto_nombre",
    "tipo_consumo", "unidad_base", "formato_compra_ml", "cantidad_envases",
    "cantidad_base_movida", "cantidad_base_calculada", "costo_neto_envase",
    "valor_neto_linea", "cpp_base_calculado", "stock_teorico_exportado",
    "stock_real_contado", "motivo_ajuste", "observaciones",
  ];

  const templateSheet = XLSX.utils.aoa_to_sheet([headers]);
  templateSheet["!cols"] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, templateSheet, "Plantilla_Unica");

  // Sheet 2: Referencia (products + locations)
  const refData = [
    ["=== PRODUCTOS ===", "", "", ""],
    ["sku_base", "producto_nombre", "tipo_consumo", "unidad_base", "capacity_ml", "cpp_actual"],
    ...products.map((p) => [
      p.code,
      p.name,
      isBottle(p) ? "ML" : "UNIT",
      isBottle(p) ? "ml" : "ud",
      p.capacity_ml || "",
      p.cost_per_unit,
    ]),
    [],
    ["=== UBICACIONES ===", ""],
    ["nombre", "tipo"],
    ...locations.map((l) => [l.name, l.type]),
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refData);
  refSheet["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, refSheet, "Referencia");

  // Sheet 3: Export_Stock_Actual
  const balanceMap = new Map<string, number>();
  balances.forEach((b) => balanceMap.set(`${b.productId}::${b.locationId}`, b.quantity));

  const locationMap = new Map<string, LocationRef>();
  locations.forEach((l) => locationMap.set(l.id, l));

  const productMap = new Map<string, ProductRef>();
  products.forEach((p) => productMap.set(p.id, p));

  const now = new Date().toISOString().split("T")[0];
  const stockRows: any[][] = [
    ["fecha_exportacion", "ubicacion", "sku_base", "producto_nombre", "tipo_consumo",
     "stock_actual_base", "unidad_base", "cpp_actual_base", "valor_total_stock", "ultima_actualizacion"],
  ];

  balances
    .sort((a, b) => {
      const la = locationMap.get(a.locationId)?.name || "";
      const lb = locationMap.get(b.locationId)?.name || "";
      return la.localeCompare(lb);
    })
    .forEach((bal) => {
      const product = productMap.get(bal.productId);
      const location = locationMap.get(bal.locationId);
      if (!product || !location) return;

      const bottle = isBottle(product);
      const costPerBase = bottle && product.capacity_ml && product.capacity_ml > 0
        ? product.cost_per_unit / product.capacity_ml
        : product.cost_per_unit;

      stockRows.push([
        now,
        location.name,
        product.code,
        product.name,
        bottle ? "ML" : "UNIT",
        bal.quantity,
        bottle ? "ml" : "ud",
        Math.round(product.cost_per_unit),
        Math.round(bal.quantity * costPerBase),
        now,
      ]);
    });

  const stockSheet = XLSX.utils.aoa_to_sheet(stockRows);
  stockSheet["!cols"] = stockRows[0].map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, stockSheet, "Export_Stock_Actual");

  return wb;
}
