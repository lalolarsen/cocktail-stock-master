/**
 * MOTOR ÚNICO DE CÁLCULO - SINGLE SOURCE OF TRUTH
 * Stockia Invoice Reader - Simplified Mode
 * 
 * Este módulo es la ÚNICA fuente de verdad para todos los cálculos de líneas de compra.
 * Cualquier cifra visible en UI debe venir de este motor.
 * 
 * SIMPLIFICADO: Solo costo neto unitario. Sin impuestos específicos, sin prorrateo.
 */

// ============================================================================
// TIPOS
// ============================================================================

export type LineStatus = "OK" | "REVIEW_REQUIRED" | "EXPENSE" | "IGNORED";

export type DiscountMode = "INCLUDED_IN_PRICE" | "APPLY_TO_GROSS" | "GLOBAL_PRORATE";

// Kept for backward compatibility but always defaults to NONE
export type TaxCategory = "NONE";

// Legacy types kept for interface compat — not used in active flow
export interface HeaderTaxTotals {
  iaba_10_total: number;
  iaba_18_total: number;
  ila_vino_205_total: number;
  ila_cerveza_205_total: number;
  ila_destilados_315_total: number;
  sources: Record<string, string>;
}

export interface ProrationDiagnostic {
  category: TaxCategory;
  total_from_header: number;
  base_net_amount: number;
  lines_count: number;
  sum_prorated: number;
  rounding_adjustment: number;
  is_valid: boolean;
  error_message?: string;
}

export interface RawLineExtraction {
  raw_product_name: string;
  qty_text: string | null;
  unit_price_text: string | null;
  line_total_text: string | null;
  discount_text: string | null;
  tax_text: string | null;
  uom_text: string | null;
}

export const TAX_RATES: Record<string, number> = { NONE: 0 };

// ============================================================================
// LINEA COMPUTADA
// ============================================================================

export interface ComputedLine {
  id: string;
  raw_product_name: string;
  
  qty_invoice: number;
  pack_multiplier: number;
  pack_reason: string;
  
  invoice_unit_price_raw: number;
  pack_priced: boolean;
  unit_price_real: number;
  
  discount_pct: number;
  unit_price_after_discount: number;
  
  real_units: number;
  gross_line: number;
  
  discount_mode: DiscountMode;
  discount_amount: number;
  
  // Tax fields — always NONE/0 in simplified mode
  tax_category: TaxCategory;
  tax_rate: number;
  taxes_excluded_for_cost: number;
  tax_details: Record<string, number>;
  
  // Core cost fields
  net_line_for_cost: number;
  net_unit_cost: number;
  
  // Legacy fields — always equal to net values
  specific_tax_amount: number;
  specific_tax_source: "NONE";
  inventory_cost_line: number;
  inventory_unit_cost: number;
  
  status: LineStatus;
  reasons: string[];
  
  matched_product_id: string | null;
  matched_product_name: string | null;
  match_confidence: number;
  uom_normalized: string;
  uom_raw: string;
}

export interface DocumentHeader {
  provider_name: string | null;
  provider_rut: string | null;
  document_number: string | null;
  document_date: string | null;
  net_total: number | null;
  iva_total: number | null;
  gross_total: number | null;
  tax_totals?: HeaderTaxTotals;
}

export interface ComputeLineInput {
  id: string;
  raw_product_name: string;
  qty_text: string | number | null;
  unit_price_text: string | number | null;
  line_total_text: string | number | null;
  discount_text: string | number | null;
  discount_mode: DiscountMode;
  pack_multiplier_override?: number;
  pack_priced_override?: boolean;
  discount_pct_override?: number;
  tax_category_override?: TaxCategory;
  uom_text?: string | null;
  // Legacy — ignored
  tax_iaba_10?: number;
  tax_iaba_18?: number;
  tax_ila_vin?: number;
  tax_ila_cer?: number;
  tax_ila_lic?: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const FREIGHT_KEYWORDS = [
  'flete', 'despacho', 'transporte', 'envío', 'envio', 
  'shipping', 'delivery', 'carga', 'reparto', 'servicio de entrega'
];

const UOM_MAPPING: Record<string, string> = {
  'cj': 'Caja', 'caja': 'Caja',
  'un': 'Unidad', 'und': 'Unidad', 'unidad': 'Unidad', 'u': 'Unidad',
  'pk': 'Pack', 'pack': 'Pack',
  'bt': 'Botella', 'bot': 'Botella', 'botella': 'Botella',
  'kg': 'Kilogramo', 'kilogramo': 'Kilogramo',
  'lt': 'Litro', 'litro': 'Litro', 'l': 'Litro',
  'ml': 'Mililitro', 'mililitro': 'Mililitro',
  'dz': 'Docena', 'docena': 'Docena',
  'gr': 'Gramo', 'g': 'Gramo', 'gramo': 'Gramo',
};

// ============================================================================
// FUNCIONES AUXILIARES PURAS
// ============================================================================

export function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  
  const cleaned = value
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function detectPackMultiplier(productName: string): { 
  multiplier: number | null; 
  confidence: 'high' | 'medium' | 'low';
  pattern: string;
} {
  const name = productName.toUpperCase();
  
  const packMatch = name.match(/(\d+)\s*(?:PC|PX)\s*X?\s*(\d+)/i);
  if (packMatch) {
    const result = parseInt(packMatch[1]) * parseInt(packMatch[2]);
    return { multiplier: result, confidence: 'high', pattern: packMatch[0] };
  }
  
  const latMatch = name.match(/LAT\d+\s*X\s*(\d+)/i);
  if (latMatch) {
    return { multiplier: parseInt(latMatch[1]), confidence: 'high', pattern: latMatch[0] };
  }
  
  const pfMatch = name.match(/(\d+)\s*PF/i);
  if (pfMatch) {
    return { multiplier: parseInt(pfMatch[1]), confidence: 'medium', pattern: pfMatch[0] };
  }
  
  const unMatch = name.match(/(\d+)\s*(?:UN|U)\b/i);
  if (unMatch) {
    return { multiplier: parseInt(unMatch[1]), confidence: 'medium', pattern: unMatch[0] };
  }
  
  const xMatch = name.match(/\bX\s*0?(\d+)\b/i);
  if (xMatch && !name.match(/\d+\s*X\s*\d+/)) {
    return { multiplier: parseInt(xMatch[1]), confidence: 'low', pattern: xMatch[0] };
  }
  
  const genericMatch = name.match(/(\d+)\s*X\s*(\d+)/i);
  if (genericMatch) {
    const first = parseInt(genericMatch[1]);
    const second = parseInt(genericMatch[2]);
    if (first > 100) {
      return { multiplier: second, confidence: 'medium', pattern: genericMatch[0] };
    }
    return { multiplier: first * second, confidence: 'medium', pattern: genericMatch[0] };
  }
  
  return { multiplier: null, confidence: 'low', pattern: '' };
}

export function isFreightLine(productName: string): boolean {
  const lower = productName.toLowerCase();
  return FREIGHT_KEYWORDS.some(kw => lower.includes(kw));
}

/** @deprecated Always returns NONE in simplified mode */
export function detectTaxCategory(_productName: string): TaxCategory {
  return 'NONE';
}

export function normalizeUom(uom: string | null | undefined): string {
  if (!uom) return 'Unidad';
  const lower = uom.toLowerCase().trim();
  return UOM_MAPPING[lower] || uom;
}

export function parseDiscount(text: string | number | null, grossLine: number): { percent: number; amount: number } {
  if (text === null || text === undefined) return { percent: 0, amount: 0 };
  
  if (typeof text === 'number') {
    if (text <= 100) {
      return { percent: text, amount: Math.round(grossLine * text / 100) };
    }
    return { percent: 0, amount: text };
  }
  
  const cleaned = text.trim();
  
  if (cleaned.includes('%')) {
    const pct = parseNumber(cleaned.replace('%', ''));
    if (pct !== null) {
      return { percent: pct, amount: Math.round(grossLine * pct / 100) };
    }
  }
  
  const amount = parseNumber(cleaned);
  if (amount !== null) {
    return { percent: 0, amount };
  }
  
  return { percent: 0, amount: 0 };
}

/** @deprecated Always returns 'Sin impuesto' in simplified mode */
export function getTaxCategoryLabel(_category: string): string {
  return 'Sin impuesto';
}

export function createEmptyHeaderTaxTotals(): HeaderTaxTotals {
  return {
    iaba_10_total: 0,
    iaba_18_total: 0,
    ila_vino_205_total: 0,
    ila_cerveza_205_total: 0,
    ila_destilados_315_total: 0,
    sources: {},
  };
}

// ============================================================================
// FUNCIÓN PRINCIPAL: computePurchaseLine
// ============================================================================

export function computePurchaseLine(input: ComputeLineInput): ComputedLine {
  const reasons: string[] = [];
  let status: LineStatus = "OK";
  
  const qtyInvoice = parseNumber(input.qty_text) ?? 0;
  const invoiceUnitPriceRaw = parseNumber(input.unit_price_text) ?? 0;
  const lineTotal = parseNumber(input.line_total_text);
  
  let packMultiplier = input.pack_multiplier_override ?? 1;
  let packReason = '';
  if (!input.pack_multiplier_override) {
    const detected = detectPackMultiplier(input.raw_product_name);
    if (detected.multiplier !== null) {
      packMultiplier = detected.multiplier;
      packReason = detected.pattern;
      if (detected.confidence === 'low') {
        reasons.push(`Multiplicador detectado (${packMultiplier}) con baja confianza`);
      }
    }
  }
  
  const packPriced = input.pack_priced_override ?? false;
  
  let unitPriceReal = invoiceUnitPriceRaw;
  if (packPriced && packMultiplier > 1) {
    unitPriceReal = Math.round(invoiceUnitPriceRaw / packMultiplier);
    reasons.push(`Precio dividido por multiplicador (${packMultiplier})`);
  } else if (packPriced && packMultiplier === 1) {
    reasons.push('⚠️ Precio por PACK pero multiplicador=1, revisar');
    status = "REVIEW_REQUIRED";
  }
  
  const realUnits = qtyInvoice * packMultiplier;
  
  const discountParsed = parseDiscount(input.discount_text, invoiceUnitPriceRaw * qtyInvoice);
  const discountPct = input.discount_pct_override ?? discountParsed.percent;
  
  const validDiscountPct = Math.max(0, Math.min(100, discountPct));
  if (discountPct !== validDiscountPct) {
    reasons.push(`Descuento ajustado de ${discountPct}% a ${validDiscountPct}%`);
  }
  
  const unitPriceAfterDiscount = Math.round(unitPriceReal * (1 - validDiscountPct / 100));
  
  let grossLine = 0;
  if (lineTotal !== null && lineTotal > 0) {
    grossLine = lineTotal;
  } else if (qtyInvoice > 0 && invoiceUnitPriceRaw > 0) {
    grossLine = qtyInvoice * invoiceUnitPriceRaw;
    reasons.push('Bruto calculado desde cantidad × precio');
  } else {
    reasons.push('No se pudo determinar el total bruto de línea');
    if (status === "OK") status = "REVIEW_REQUIRED";
  }
  
  // Simplified: no tax detection, always NONE
  const taxCategory: TaxCategory = "NONE";
  
  const netLineForCost = unitPriceAfterDiscount * realUnits;
  const netUnitCost = unitPriceAfterDiscount;
  
  // Freight detection
  const isFreight = isFreightLine(input.raw_product_name);
  if (isFreight) {
    status = "EXPENSE";
    reasons.push('Detectado como flete/despacho');
  }
  
  // Validations
  if (status !== "EXPENSE") {
    if (realUnits <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Unidades reales <= 0');
    }
    if (unitPriceReal <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Precio unitario real <= 0');
    }
  }
  
  const uomNormalized = normalizeUom(input.uom_text);
  
  return {
    id: input.id,
    raw_product_name: input.raw_product_name,
    qty_invoice: qtyInvoice,
    pack_multiplier: packMultiplier,
    pack_reason: packReason,
    invoice_unit_price_raw: invoiceUnitPriceRaw,
    pack_priced: packPriced,
    unit_price_real: unitPriceReal,
    discount_pct: validDiscountPct,
    unit_price_after_discount: unitPriceAfterDiscount,
    real_units: realUnits,
    gross_line: grossLine,
    discount_mode: input.discount_mode,
    discount_amount: Math.round(unitPriceReal * realUnits * validDiscountPct / 100),
    tax_category: taxCategory,
    tax_rate: 0,
    taxes_excluded_for_cost: 0,
    tax_details: {},
    net_line_for_cost: netLineForCost,
    net_unit_cost: netUnitCost,
    specific_tax_amount: 0,
    specific_tax_source: "NONE",
    inventory_cost_line: netLineForCost,
    inventory_unit_cost: realUnits > 0 ? Math.round(netLineForCost / realUnits) : 0,
    status,
    reasons,
    matched_product_id: null,
    matched_product_name: null,
    match_confidence: 0,
    uom_normalized: uomNormalized,
    uom_raw: input.uom_text || '',
  };
}

// ============================================================================
// PRORRATEO — DESACTIVADO (stub para compatibilidad)
// ============================================================================

/** @deprecated No-op in simplified mode */
export function applyTaxProration(
  lines: ComputedLine[],
  _headerTaxTotals: HeaderTaxTotals
): { lines: ComputedLine[]; diagnostics: ProrationDiagnostic[] } {
  return { lines, diagnostics: [] };
}

// ============================================================================
// RECALCULO DE LÍNEA
// ============================================================================

export function recalculateLine(
  line: ComputedLine, 
  updates: Partial<{
    qty_invoice: number;
    pack_multiplier: number;
    pack_priced: boolean;
    discount_pct: number;
    tax_category: TaxCategory;
  }>
): ComputedLine {
  const newQty = updates.qty_invoice ?? line.qty_invoice;
  const newMultiplier = updates.pack_multiplier ?? line.pack_multiplier;
  const newPackPriced = updates.pack_priced ?? line.pack_priced;
  const newDiscountPct = Math.max(0, Math.min(100, updates.discount_pct ?? line.discount_pct));
  
  let newUnitPriceReal = line.invoice_unit_price_raw;
  if (newPackPriced && newMultiplier > 1) {
    newUnitPriceReal = Math.round(line.invoice_unit_price_raw / newMultiplier);
  }
  
  const newRealUnits = newQty * newMultiplier;
  const newUnitPriceAfterDiscount = Math.round(newUnitPriceReal * (1 - newDiscountPct / 100));
  const newNetLine = newUnitPriceAfterDiscount * newRealUnits;
  const newDiscountAmount = Math.round(newUnitPriceReal * newRealUnits * newDiscountPct / 100);
  
  const reasons: string[] = [];
  let status: LineStatus = "OK";
  
  if (line.status === "EXPENSE") {
    status = "EXPENSE";
  } else if (line.status === "IGNORED") {
    status = "IGNORED";
  } else {
    if (newRealUnits <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Unidades reales <= 0');
    }
    if (newUnitPriceReal <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Precio unitario real <= 0');
    }
    if (newPackPriced && newMultiplier === 1) {
      status = "REVIEW_REQUIRED";
      reasons.push('⚠️ Precio por PACK pero multiplicador=1');
    }
  }
  
  return {
    ...line,
    qty_invoice: newQty,
    pack_multiplier: newMultiplier,
    pack_priced: newPackPriced,
    unit_price_real: newUnitPriceReal,
    discount_pct: newDiscountPct,
    unit_price_after_discount: newUnitPriceAfterDiscount,
    real_units: newRealUnits,
    discount_amount: newDiscountAmount,
    net_line_for_cost: newNetLine,
    net_unit_cost: newUnitPriceAfterDiscount,
    tax_category: "NONE",
    tax_rate: 0,
    specific_tax_amount: 0,
    specific_tax_source: "NONE",
    inventory_cost_line: newNetLine,
    inventory_unit_cost: newRealUnits > 0 ? Math.round(newNetLine / newRealUnits) : 0,
    status,
    reasons: status === "EXPENSE" ? line.reasons : reasons,
  };
}

// ============================================================================
// VALIDACIÓN PARA CONFIRMACIÓN
// ============================================================================

export function validateForConfirmation(
  lines: ComputedLine[],
  _headerTaxTotals?: HeaderTaxTotals
): {
  canConfirm: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const reviewRequired = lines.filter(l => l.status === "REVIEW_REQUIRED");
  if (reviewRequired.length > 0) {
    errors.push(`${reviewRequired.length} línea(s) requieren revisión`);
  }
  
  const inventoryLines = lines.filter(l => l.status === "OK");
  const unmatchedInventory = inventoryLines.filter(l => !l.matched_product_id);
  if (unmatchedInventory.length > 0) {
    errors.push(`${unmatchedInventory.length} línea(s) de inventario sin producto asignado`);
  }
  
  const zeroUnits = inventoryLines.filter(l => l.real_units <= 0);
  if (zeroUnits.length > 0) {
    errors.push(`${zeroUnits.length} línea(s) con unidades reales = 0`);
  }
  
  const zeroPrice = inventoryLines.filter(l => l.unit_price_real <= 0);
  if (zeroPrice.length > 0) {
    errors.push(`${zeroPrice.length} línea(s) con precio unitario = 0`);
  }
  
  return {
    canConfirm: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// DIAGNÓSTICO
// ============================================================================

export function generateDiagnostic(
  header: DocumentHeader,
  lines: ComputedLine[]
): {
  summary: {
    totalLines: number;
    okLines: number;
    reviewLines: number;
    expenseLines: number;
    ignoredLines: number;
  };
  totals: {
    grossTotal: number;
    discountTotal: number;
    netTotal: number;
    specificTaxTotal: number;
    inventoryCostTotal: number;
  };
  validation: ReturnType<typeof validateForConfirmation>;
} {
  const summary = {
    totalLines: lines.length,
    okLines: lines.filter(l => l.status === "OK").length,
    reviewLines: lines.filter(l => l.status === "REVIEW_REQUIRED").length,
    expenseLines: lines.filter(l => l.status === "EXPENSE").length,
    ignoredLines: lines.filter(l => l.status === "IGNORED").length,
  };
  
  const inventoryLines = lines.filter(l => l.status === "OK");
  
  const totals = {
    grossTotal: lines.reduce((s, l) => s + l.gross_line, 0),
    discountTotal: lines.reduce((s, l) => s + l.discount_amount, 0),
    netTotal: inventoryLines.reduce((s, l) => s + l.net_line_for_cost, 0),
    specificTaxTotal: 0,
    inventoryCostTotal: inventoryLines.reduce((s, l) => s + l.net_line_for_cost, 0),
  };
  
  return {
    summary,
    totals,
    validation: validateForConfirmation(lines),
  };
}
