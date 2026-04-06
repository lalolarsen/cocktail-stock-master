/**
 * Excel-First Inventory Parser
 *
 * Supports two modes:
 * 1. Legacy unified template (21 columns, sku_base matching)
 * 2. Simplified per-type templates (fuzzy name matching)
 *
 * Resolves products via code OR fuzzy name similarity.
 */

import * as XLSX from "xlsx";
import { isBottle } from "@/lib/product-type";

// ── Types ────────────────────────────────────────────────────────────────────

export type MovementType = "COMPRA" | "TRANSFERENCIA" | "CONTEO";
export type ConsumoType = "ML" | "UNIT";
export type MatchConfidence = "alta" | "media" | "baja" | "sin_match";

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
  matchConfidence: MatchConfidence;
  productNameMatched: string | null;
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

// ── Fuzzy matching ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Bigram similarity
  const bigramsA = bigrams(na);
  const bigramsB = bigrams(nb);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.substring(i, i + 2));
  }
  return set;
}

export function fuzzyMatchProduct(
  name: string,
  products: ProductRef[],
): { product: ProductRef | null; confidence: MatchConfidence } {
  if (!name || !name.trim()) return { product: null, confidence: "sin_match" };

  // Try exact code match first
  const norm = normalize(name);
  const byCode = products.find((p) => p.code && normalize(p.code) === norm);
  if (byCode) return { product: byCode, confidence: "alta" };

  // Fuzzy name match
  let best: ProductRef | null = null;
  let bestScore = 0;

  for (const p of products) {
    const score = similarity(name, p.name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore >= 0.85) return { product: best, confidence: "alta" };
  if (bestScore >= 0.7) return { product: best, confidence: "media" };
  if (bestScore >= 0.5) return { product: best, confidence: "baja" };
  return { product: null, confidence: "sin_match" };
}

// ── Column mapping (legacy) ──────────────────────────────────────────────────

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

// ── Simplified parsers ───────────────────────────────────────────────────────

export function parseCompraSimple(
  fileData: ArrayBuffer,
  products: ProductRef[],
  locations: LocationRef[],
): ParseResult {
  const rawRows = readFirstSheet(fileData);
  const bodega = locations.find((l) => normalize(l.name).includes("bodega")) || locations[0];
  const errors: ValidationError[] = [];
  const resolved: ResolvedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 2;
    const rowErrors: string[] = [];

    const nombreExcel = str(raw, "producto_nombre", "producto", "nombre");
    const cantidad = num(raw, "cantidad", "cantidad_envases", "qty");
    const costo = num(raw, "costo_compra", "costo_neto_envase", "costo", "precio", "costo_unitario");
    const documento = str(raw, "documento", "documento_ref", "factura", "doc");

    const { product, confidence } = fuzzyMatchProduct(nombreExcel, products);

    if (!product && confidence === "sin_match") {
      rowErrors.push(`Producto "${nombreExcel}" no encontrado`);
    }
    if (!cantidad || cantidad <= 0) rowErrors.push("Cantidad requerida > 0");
    if (costo === null || costo < 0) rowErrors.push("Costo requerido");

    const isBotella = product ? isBottle(product) : false;
    const formatoMl = product?.capacity_ml || null;
    const computedBaseQty = isBotella && formatoMl ? (cantidad || 0) * formatoMl : (cantidad || 0);

    const row: ResolvedRow = {
      rowIndex,
      tipo_movimiento: "COMPRA",
      fecha: str(raw, "fecha") || new Date().toISOString().split("T")[0],
      documento_ref: documento,
      proveedor: str(raw, "proveedor"),
      ubicacion_origen: "",
      ubicacion_destino: bodega?.name || "Bodega Principal",
      sku_base: product?.code || "",
      producto_nombre: nombreExcel,
      tipo_consumo: isBotella ? "ML" : "UNIT",
      unidad_base: isBotella ? "ml" : "ud",
      formato_compra_ml: formatoMl,
      cantidad_envases: cantidad,
      cantidad_base_movida: null,
      cantidad_base_calculada: null,
      costo_neto_envase: costo,
      valor_neto_linea: (costo || 0) * (cantidad || 0),
      cpp_base_calculado: null,
      stock_teorico_exportado: null,
      stock_real_contado: null,
      motivo_ajuste: "",
      observaciones: str(raw, "observaciones", "notas"),
      productId: product?.id || null,
      locationOrigenId: null,
      locationDestinoId: bodega?.id || null,
      computedBaseQty,
      matchConfidence: confidence,
      productNameMatched: product?.name || null,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    };

    rowErrors.forEach((msg) => errors.push({ rowIndex, field: "general", message: msg }));
    resolved.push(row);
  }

  return buildResult(resolved, errors);
}

export function parseReposicionSimple(
  fileData: ArrayBuffer,
  products: ProductRef[],
  locations: LocationRef[],
  balances: Map<string, number>,
): ParseResult {
  const rawRows = readFirstSheet(fileData);
  const bodega = locations.find((l) => normalize(l.name).includes("bodega")) || locations[0];
  const locationByName = new Map<string, LocationRef>();
  locations.forEach((l) => locationByName.set(normalize(l.name), l));

  const errors: ValidationError[] = [];
  const resolved: ResolvedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 2;
    const rowErrors: string[] = [];

    const nombreExcel = str(raw, "producto_nombre", "producto", "nombre");
    const cantidad = num(raw, "cantidad", "cantidad_base_movida", "qty");
    const destinoNombre = str(raw, "ubicacion_destino", "destino", "ubicacion");

    const { product, confidence } = fuzzyMatchProduct(nombreExcel, products);
    const locDestino = destinoNombre ? locationByName.get(normalize(destinoNombre)) || null : null;

    if (!product && confidence === "sin_match") rowErrors.push(`Producto "${nombreExcel}" no encontrado`);
    if (!cantidad || cantidad <= 0) rowErrors.push("Cantidad requerida > 0");
    if (!locDestino && destinoNombre) rowErrors.push(`Ubicación "${destinoNombre}" no encontrada`);
    if (!destinoNombre) rowErrors.push("Ubicación destino requerida");

    // Check stock at origin (bodega)
    if (product && bodega && cantidad && cantidad > 0) {
      const key = `${product.id}::${bodega.id}`;
      const currentBal = balances.get(key) || 0;
      const isBotella = isBottle(product);
      const baseQty = isBotella && product.capacity_ml ? cantidad * product.capacity_ml : cantidad;
      if (baseQty > currentBal) rowErrors.push(`Stock insuficiente en bodega (disp: ${currentBal})`);
    }

    const isBotella = product ? isBottle(product) : false;
    const computedBaseQty = isBotella && product?.capacity_ml ? (cantidad || 0) * product.capacity_ml : (cantidad || 0);

    const row: ResolvedRow = {
      rowIndex,
      tipo_movimiento: "TRANSFERENCIA",
      fecha: str(raw, "fecha") || new Date().toISOString().split("T")[0],
      documento_ref: "",
      proveedor: "",
      ubicacion_origen: bodega?.name || "Bodega Principal",
      ubicacion_destino: destinoNombre,
      sku_base: product?.code || "",
      producto_nombre: nombreExcel,
      tipo_consumo: isBotella ? "ML" : "UNIT",
      unidad_base: isBotella ? "ml" : "ud",
      formato_compra_ml: null,
      cantidad_envases: null,
      cantidad_base_movida: computedBaseQty,
      cantidad_base_calculada: null,
      costo_neto_envase: null,
      valor_neto_linea: null,
      cpp_base_calculado: null,
      stock_teorico_exportado: null,
      stock_real_contado: null,
      motivo_ajuste: "",
      observaciones: str(raw, "observaciones", "notas"),
      productId: product?.id || null,
      locationOrigenId: bodega?.id || null,
      locationDestinoId: locDestino?.id || null,
      computedBaseQty,
      matchConfidence: confidence,
      productNameMatched: product?.name || null,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    };

    rowErrors.forEach((msg) => errors.push({ rowIndex, field: "general", message: msg }));
    resolved.push(row);
  }

  return buildResult(resolved, errors);
}

export function parseConteoSimple(
  fileData: ArrayBuffer,
  products: ProductRef[],
  locations: LocationRef[],
  balances: Map<string, number>,
  locationId?: string,
): ParseResult {
  const rawRows = readFirstSheet(fileData);
  const locationByName = new Map<string, LocationRef>();
  locations.forEach((l) => locationByName.set(normalize(l.name), l));

  const errors: ValidationError[] = [];
  const resolved: ResolvedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 2;
    const rowErrors: string[] = [];

    const nombreExcel = str(raw, "producto_nombre", "producto", "nombre");
    const stockReal = num(raw, "stock_real", "stock_real_contado", "real", "contado");
    const ubicNombre = str(raw, "ubicacion", "ubicacion_destino", "destino");

    const { product, confidence } = fuzzyMatchProduct(nombreExcel, products);

    // Resolve location
    let locDestino: LocationRef | null = null;
    if (locationId) {
      locDestino = locations.find((l) => l.id === locationId) || null;
    } else if (ubicNombre) {
      locDestino = locationByName.get(normalize(ubicNombre)) || null;
    }

    if (!product && confidence === "sin_match") rowErrors.push(`Producto "${nombreExcel}" no encontrado`);
    if (stockReal === null || stockReal < 0) rowErrors.push("Stock real requerido ≥ 0");
    if (!locDestino) rowErrors.push("Ubicación no encontrada");

    // Get theoretical stock
    const stockTeorico = product && locDestino
      ? balances.get(`${product.id}::${locDestino.id}`) || 0
      : 0;

    const row: ResolvedRow = {
      rowIndex,
      tipo_movimiento: "CONTEO",
      fecha: new Date().toISOString().split("T")[0],
      documento_ref: "",
      proveedor: "",
      ubicacion_origen: "",
      ubicacion_destino: locDestino?.name || ubicNombre || "",
      sku_base: product?.code || "",
      producto_nombre: nombreExcel,
      tipo_consumo: product ? (isBottle(product) ? "ML" : "UNIT") : "UNIT",
      unidad_base: product ? (isBottle(product) ? "ml" : "ud") : "ud",
      formato_compra_ml: null,
      cantidad_envases: null,
      cantidad_base_movida: null,
      cantidad_base_calculada: null,
      costo_neto_envase: null,
      valor_neto_linea: null,
      cpp_base_calculado: null,
      stock_teorico_exportado: stockTeorico,
      stock_real_contado: stockReal,
      motivo_ajuste: str(raw, "motivo_ajuste", "motivo", "observacion"),
      observaciones: "",
      productId: product?.id || null,
      locationOrigenId: null,
      locationDestinoId: locDestino?.id || null,
      computedBaseQty: stockReal || 0,
      matchConfidence: confidence,
      productNameMatched: product?.name || null,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    };

    rowErrors.forEach((msg) => errors.push({ rowIndex, field: "general", message: msg }));
    resolved.push(row);
  }

  return buildResult(resolved, errors);
}

// ── Legacy unified parser ────────────────────────────────────────────────────

export function parseExcelInventory(
  fileData: ArrayBuffer,
  products: ProductRef[],
  locations: LocationRef[],
  balances: Map<string, number>,
): ParseResult {
  const workbook = XLSX.read(fileData);
  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase().includes("plantilla")) ||
    workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  const productByCode = new Map<string, ProductRef>();
  products.forEach((p) => {
    if (p.code) productByCode.set(p.code.toLowerCase().trim(), p);
  });

  const locationByName = new Map<string, LocationRef>();
  locations.forEach((l) => locationByName.set(l.name.toLowerCase().trim(), l));

  const errors: ValidationError[] = [];
  const resolved: ResolvedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 2;
    const row = mapRawRow(raw, rowIndex);

    if (!row.tipo_movimiento && !row.sku_base) continue;

    const tipo = row.tipo_movimiento.toUpperCase().trim() as MovementType;
    if (!["COMPRA", "TRANSFERENCIA", "CONTEO"].includes(tipo)) {
      errors.push({ rowIndex, field: "tipo_movimiento", message: `Tipo inválido: "${row.tipo_movimiento}"` });
      resolved.push({ ...row, productId: null, locationOrigenId: null, locationDestinoId: null, computedBaseQty: 0, matchConfidence: "sin_match", productNameMatched: null, errors: [`Tipo inválido`], isValid: false });
      continue;
    }

    const rowErrors: string[] = [];

    // Resolve product: try code first, then fuzzy name
    const sku = (row.sku_base || "").toLowerCase().trim();
    let product = sku ? productByCode.get(sku) : null;
    let confidence: MatchConfidence = "sin_match";

    if (product) {
      confidence = "alta";
    } else if (row.producto_nombre) {
      const match = fuzzyMatchProduct(row.producto_nombre, products);
      product = match.product;
      confidence = match.confidence;
    }

    if (!product) {
      rowErrors.push(sku ? `SKU "${row.sku_base}" no encontrado` : `Producto "${row.producto_nombre}" no encontrado`);
      errors.push({ rowIndex, field: "sku_base", message: rowErrors[rowErrors.length - 1] });
    }

    const tipoConsumo: ConsumoType =
      row.tipo_consumo?.toUpperCase().trim() === "UNIT" ? "UNIT"
        : row.tipo_consumo?.toUpperCase().trim() === "ML" ? "ML"
          : product ? (isBottle(product) ? "ML" : "UNIT") : "UNIT";

    const locOrigen = row.ubicacion_origen ? locationByName.get(row.ubicacion_origen.toLowerCase().trim()) || null : null;
    const locDestino = row.ubicacion_destino ? locationByName.get(row.ubicacion_destino.toLowerCase().trim()) || null : null;

    let computedBaseQty = 0;

    if (tipo === "COMPRA") {
      if (!locDestino && row.ubicacion_destino) rowErrors.push(`Ubicación destino "${row.ubicacion_destino}" no encontrada`);
      else if (!row.ubicacion_destino) rowErrors.push("Ubicación destino requerida");

      const cantEnvases = toNum(row.cantidad_envases);
      const costoEnvase = toNum(row.costo_neto_envase);
      if (!cantEnvases || cantEnvases <= 0) rowErrors.push("Cantidad envases requerida > 0");
      if (costoEnvase === null || costoEnvase < 0) rowErrors.push("Costo neto envase requerido");

      if (tipoConsumo === "ML") {
        const formato = toNum(row.formato_compra_ml);
        if (!formato || formato <= 0) rowErrors.push("Formato compra ML requerido para tipo ML");
        else computedBaseQty = (cantEnvases || 0) * formato;
      } else {
        computedBaseQty = cantEnvases || 0;
      }
    } else if (tipo === "TRANSFERENCIA") {
      if (!locOrigen && row.ubicacion_origen) rowErrors.push(`Ubicación origen "${row.ubicacion_origen}" no encontrada`);
      else if (!row.ubicacion_origen) rowErrors.push("Ubicación origen requerida");
      if (!locDestino && row.ubicacion_destino) rowErrors.push(`Ubicación destino "${row.ubicacion_destino}" no encontrada`);
      else if (!row.ubicacion_destino) rowErrors.push("Ubicación destino requerida");

      computedBaseQty = toNum(row.cantidad_base_movida) || 0;
      if (computedBaseQty <= 0) rowErrors.push("Cantidad base movida requerida > 0");

      if (product && locOrigen && computedBaseQty > 0) {
        const key = `${product.id}::${locOrigen.id}`;
        const currentBalance = balances.get(key) || 0;
        if (computedBaseQty > currentBalance) rowErrors.push(`Stock insuficiente en origen (disponible: ${currentBalance})`);
      }
    } else if (tipo === "CONTEO") {
      if (!locDestino && row.ubicacion_destino) rowErrors.push(`Ubicación "${row.ubicacion_destino}" no encontrada`);
      else if (!row.ubicacion_destino) rowErrors.push("Ubicación requerida");

      const stockReal = toNum(row.stock_real_contado);
      if (stockReal === null || stockReal < 0) rowErrors.push("Stock real contado requerido ≥ 0");
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
      matchConfidence: confidence,
      productNameMatched: product?.name || null,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    });
  }

  return buildResult(resolved, errors);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFirstSheet(fileData: ArrayBuffer): Record<string, any>[] {
  const wb = XLSX.read(fileData);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
}

/** Get string value from raw row by trying multiple possible column names */
function str(raw: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase().trim() === key.toLowerCase()) return String(v || "").trim();
    }
  }
  return "";
}

/** Get numeric value from raw row by trying multiple possible column names */
function num(raw: Record<string, any>, ...keys: string[]): number | null {
  for (const key of keys) {
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase().trim() === key.toLowerCase()) {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      }
    }
  }
  return null;
}

function buildResult(resolved: ResolvedRow[], errors: ValidationError[]): ParseResult {
  return {
    rows: resolved,
    errors,
    summary: {
      compras: resolved.filter((r) => r.tipo_movimiento === "COMPRA").length,
      transferencias: resolved.filter((r) => r.tipo_movimiento === "TRANSFERENCIA").length,
      conteos: resolved.filter((r) => r.tipo_movimiento === "CONTEO").length,
      valid: resolved.filter((r) => r.isValid).length,
      invalid: resolved.filter((r) => !r.isValid).length,
    },
  };
}

function mapRawRow(raw: Record<string, any>, rowIndex: number): ExcelInventoryRow {
  const mapped: any = { rowIndex };
  const normalizedRaw = new Map<string, any>();
  Object.entries(raw).forEach(([key, val]) => normalizedRaw.set(key.toLowerCase().trim(), val));

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

  // Sheet 2: Referencia
  const refData = [
    ["=== PRODUCTOS ===", "", "", ""],
    ["sku_base", "producto_nombre", "tipo_consumo", "unidad_base", "capacity_ml", "cpp_actual"],
    ...products.map((p) => [
      p.code, p.name, isBottle(p) ? "ML" : "UNIT", isBottle(p) ? "ml" : "ud", p.capacity_ml || "", p.cost_per_unit,
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
        ? product.cost_per_unit / product.capacity_ml : product.cost_per_unit;

      stockRows.push([
        now, location.name, product.code, product.name, bottle ? "ML" : "UNIT",
        bal.quantity, bottle ? "ml" : "ud", Math.round(product.cost_per_unit),
        Math.round(bal.quantity * costPerBase), now,
      ]);
    });

  const stockSheet = XLSX.utils.aoa_to_sheet(stockRows);
  stockSheet["!cols"] = stockRows[0].map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, stockSheet, "Export_Stock_Actual");

  return wb;
}

// ── Conteo template generator ────────────────────────────────────────────────

export function generateConteoTemplate(
  products: ProductRef[],
  location: LocationRef,
  balances: { productId: string; locationId: string; quantity: number }[],
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const productMap = new Map<string, ProductRef>();
  products.forEach((p) => productMap.set(p.id, p));

  const rows: any[][] = [
    ["producto_nombre", "sku_base", "unidad", "formato", "stock_teorico", "stock_real"],
  ];

  const locationBalances = balances.filter((b) => b.locationId === location.id);

  for (const bal of locationBalances) {
    const product = productMap.get(bal.productId);
    if (!product) continue;
    const bottle = isBottle(product);
    rows.push([
      product.name,
      product.code,
      bottle ? "ml" : "ud",
      bottle ? (product.capacity_ml || "") : "",
      bal.quantity,
      "", // stock_real → user fills this
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, sheet, `Conteo_${location.name}`);

  return wb;
}
