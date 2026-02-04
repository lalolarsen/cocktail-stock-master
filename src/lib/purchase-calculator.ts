/**
 * MOTOR ÚNICO DE CÁLCULO - SINGLE SOURCE OF TRUTH
 * DiStock Invoice Reader - Stabilization Mode
 * 
 * Este módulo es la ÚNICA fuente de verdad para todos los cálculos de líneas de compra.
 * Cualquier cifra visible en UI debe venir de este motor.
 * NO se permiten cálculos ad-hoc en otros archivos.
 */

// ============================================================================
// TIPOS
// ============================================================================

export type LineStatus = "OK" | "REVIEW_REQUIRED" | "EXPENSE" | "IGNORED";

export type DiscountMode = "INCLUDED_IN_PRICE" | "APPLY_TO_GROSS" | "GLOBAL_PRORATE";

export type TaxCategory = 
  | "NONE" 
  | "IVA" 
  | "IABA10" 
  | "IABA18" 
  | "ILA_VINO_20_5" 
  | "ILA_CERVEZA_20_5" 
  | "ILA_DESTILADOS_31_5";

export interface RawLineExtraction {
  raw_product_name: string;
  qty_text: string | null;
  unit_price_text: string | null;
  line_total_text: string | null;
  discount_text: string | null;
  tax_text: string | null;
  uom_text: string | null;
}

export interface ComputedLine {
  // Identificador
  id: string;
  raw_product_name: string;
  
  // Datos de entrada (parseados del texto)
  qty_invoice: number;
  pack_multiplier: number; // default 1, editable
  pack_reason: string; // Patrón detectado (ej: "6PCX4")
  
  // Precio de factura
  invoice_unit_price_raw: number; // Precio leído de la factura
  pack_priced: boolean; // Si el precio viene por pack
  unit_price_real: number; // Precio por unidad base (calculado)
  
  // Descuento editable
  discount_pct: number; // 0..100, editable
  unit_price_after_discount: number; // unit_price_real * (1 - discount_pct/100)
  
  // Cálculos automáticos
  real_units: number; // qty_invoice × pack_multiplier
  
  // Totales brutos
  gross_line: number; // preferir line_total_text si existe; si no, unit_price × qty_invoice
  
  // Descuentos (legacy - para compatibilidad)
  discount_mode: DiscountMode;
  discount_amount: number;
  
  // Impuestos informativos (NO afectan costo)
  tax_category: TaxCategory;
  taxes_excluded_for_cost: number; // IVA/ILA/IABA
  tax_details: {
    iva?: number;
    iaba_10?: number;
    iaba_18?: number;
    ila_vin?: number;
    ila_cer?: number;
    ila_lic?: number;
  };
  
  // Cálculos finales (SINGLE SOURCE OF TRUTH)
  net_line_for_cost: number; // unit_price_after_discount * real_units
  net_unit_cost: number; // unit_price_after_discount
  
  // Estado y validación
  status: LineStatus;
  reasons: string[]; // Explica qué falta o qué se asumió
  
  // Metadata
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
  // Impuestos por línea (si vienen en la factura)
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

// Keywords para clasificación de impuestos por producto
const TAX_CATEGORY_KEYWORDS: Record<TaxCategory, string[]> = {
  NONE: [],
  IVA: [],
  IABA10: ['bebida', 'gaseosa', 'jugo', 'agua mineral', 'limonada'],
  IABA18: ['energy', 'red bull', 'monster', 'energética', 'hipertónica'],
  ILA_VINO_20_5: ['vino', 'sauvignon', 'cabernet', 'merlot', 'chardonnay', 'carmenere', 'malbec', 'pinot'],
  ILA_CERVEZA_20_5: ['cerveza', 'beer', 'heineken', 'corona', 'kunstmann', 'austral', 'cristal', 'escudo', 'becker'],
  ILA_DESTILADOS_31_5: ['vodka', 'gin', 'ron', 'whisky', 'pisco', 'tequila', 'aguardiente', 'brandy', 'cognac', 'licor'],
};

// ============================================================================
// FUNCIONES AUXILIARES PURAS
// ============================================================================

/**
 * Parsea un valor numérico desde texto, manejando formatos chilenos
 */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  
  // Limpiar formato chileno: 1.234.567 -> 1234567
  const cleaned = value
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '') // miles
    .replace(/,/g, '.'); // decimales
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Detecta multiplicador de empaque desde el nombre del producto
 * Formatos: 6PCX4, 4PC X 6, LAT250X24, 24PF, X06, 6PF-220CC, 24UN, 12X1
 * Retorna el patrón detectado como razón
 */
export function detectPackMultiplier(productName: string): { 
  multiplier: number | null; 
  confidence: 'high' | 'medium' | 'low';
  pattern: string;
} {
  const name = productName.toUpperCase();
  
  // Patrón 1: NpcxM o NpxM (6pcx4, 4px6)
  const packMatch = name.match(/(\d+)\s*(?:PC|PX)\s*X?\s*(\d+)/i);
  if (packMatch) {
    const result = parseInt(packMatch[1]) * parseInt(packMatch[2]);
    return { multiplier: result, confidence: 'high', pattern: packMatch[0] };
  }
  
  // Patrón 2: LATXXXXY o similar (LAT250X24)
  const latMatch = name.match(/LAT\d+\s*X\s*(\d+)/i);
  if (latMatch) {
    return { multiplier: parseInt(latMatch[1]), confidence: 'high', pattern: latMatch[0] };
  }
  
  // Patrón 3: XXPF (24PF = 24 unidades)
  const pfMatch = name.match(/(\d+)\s*PF/i);
  if (pfMatch) {
    return { multiplier: parseInt(pfMatch[1]), confidence: 'medium', pattern: pfMatch[0] };
  }
  
  // Patrón 4: XXUN o XXu (24UN = 24 unidades)
  const unMatch = name.match(/(\d+)\s*(?:UN|U)\b/i);
  if (unMatch) {
    return { multiplier: parseInt(unMatch[1]), confidence: 'medium', pattern: unMatch[0] };
  }
  
  // Patrón 5: X seguido de número (X06 = 6)
  const xMatch = name.match(/\bX\s*0?(\d+)\b/i);
  if (xMatch && !name.match(/\d+\s*X\s*\d+/)) {
    // Solo si no es parte de un patrón NxM
    return { multiplier: parseInt(xMatch[1]), confidence: 'low', pattern: xMatch[0] };
  }
  
  // Patrón 6: NxM genérico (12x1, 6x4)
  const genericMatch = name.match(/(\d+)\s*X\s*(\d+)/i);
  if (genericMatch) {
    const first = parseInt(genericMatch[1]);
    const second = parseInt(genericMatch[2]);
    // Si el primer número parece volumen (> 100), asumimos que es pack
    if (first > 100) {
      return { multiplier: second, confidence: 'medium', pattern: genericMatch[0] };
    }
    return { multiplier: first * second, confidence: 'medium', pattern: genericMatch[0] };
  }
  
  return { multiplier: null, confidence: 'low', pattern: '' };
}

/**
 * Detecta si una línea es flete/despacho
 */
export function isFreightLine(productName: string): boolean {
  const lower = productName.toLowerCase();
  return FREIGHT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Detecta categoría de impuesto según nombre del producto
 */
export function detectTaxCategory(productName: string): TaxCategory {
  const lower = productName.toLowerCase();
  
  // Orden de prioridad: destilados > vino > cerveza > iaba18 > iaba10
  for (const kw of TAX_CATEGORY_KEYWORDS.ILA_DESTILADOS_31_5) {
    if (lower.includes(kw)) return 'ILA_DESTILADOS_31_5';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.ILA_VINO_20_5) {
    if (lower.includes(kw)) return 'ILA_VINO_20_5';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.ILA_CERVEZA_20_5) {
    if (lower.includes(kw)) return 'ILA_CERVEZA_20_5';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.IABA18) {
    if (lower.includes(kw)) return 'IABA18';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.IABA10) {
    if (lower.includes(kw)) return 'IABA10';
  }
  
  return 'NONE';
}

/**
 * Normaliza unidad de medida
 */
export function normalizeUom(uom: string | null | undefined): string {
  if (!uom) return 'Unidad';
  const lower = uom.toLowerCase().trim();
  return UOM_MAPPING[lower] || uom;
}

/**
 * Parsea descuento desde texto
 * Soporta: "20%", "$5.000", "-15%", etc.
 */
export function parseDiscount(text: string | number | null, grossLine: number): { percent: number; amount: number } {
  if (text === null || text === undefined) return { percent: 0, amount: 0 };
  
  if (typeof text === 'number') {
    // Si es un número pequeño (<100), probablemente es porcentaje
    if (text <= 100) {
      return { percent: text, amount: Math.round(grossLine * text / 100) };
    }
    return { percent: 0, amount: text };
  }
  
  const cleaned = text.trim();
  
  // Detectar porcentaje
  if (cleaned.includes('%')) {
    const pct = parseNumber(cleaned.replace('%', ''));
    if (pct !== null) {
      return { percent: pct, amount: Math.round(grossLine * pct / 100) };
    }
  }
  
  // Es un monto absoluto
  const amount = parseNumber(cleaned);
  if (amount !== null) {
    return { percent: 0, amount };
  }
  
  return { percent: 0, amount: 0 };
}

/**
 * Obtiene etiqueta legible para categoría de impuesto
 */
export function getTaxCategoryLabel(category: TaxCategory): string {
  const labels: Record<TaxCategory, string> = {
    NONE: 'Sin impuesto',
    IVA: 'IVA 19%',
    IABA10: 'IABA 10%',
    IABA18: 'IABA 18%',
    ILA_VINO_20_5: 'ILA Vino 20,5%',
    ILA_CERVEZA_20_5: 'ILA Cerveza 20,5%',
    ILA_DESTILADOS_31_5: 'ILA Destilados 31,5%',
  };
  return labels[category];
}

// ============================================================================
// FUNCIÓN PRINCIPAL: computePurchaseLine
// ============================================================================

/**
 * MOTOR ÚNICO DE CÁLCULO
 * Esta función calcula TODOS los valores derivados de una línea de compra.
 * Es determinística y pura (mismo input = mismo output).
 */
export function computePurchaseLine(input: ComputeLineInput): ComputedLine {
  const reasons: string[] = [];
  let status: LineStatus = "OK";
  
  // 1. Parsear valores de entrada
  const qtyInvoice = parseNumber(input.qty_text) ?? 0;
  const invoiceUnitPriceRaw = parseNumber(input.unit_price_text) ?? 0;
  const lineTotal = parseNumber(input.line_total_text);
  
  // 2. Detectar multiplicador de empaque
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
  
  // 3. Determinar si precio viene por pack (default: false = precio por unidad)
  const packPriced = input.pack_priced_override ?? false;
  
  // 4. Calcular precio unitario real
  let unitPriceReal = invoiceUnitPriceRaw;
  if (packPriced && packMultiplier > 1) {
    unitPriceReal = Math.round(invoiceUnitPriceRaw / packMultiplier);
    reasons.push(`Precio dividido por multiplicador (${packMultiplier})`);
  } else if (packPriced && packMultiplier === 1) {
    reasons.push('⚠️ Precio por PACK pero multiplicador=1, revisar');
    status = "REVIEW_REQUIRED";
  }
  
  // 5. Calcular unidades reales
  const realUnits = qtyInvoice * packMultiplier;
  
  // 6. Parsear descuento (preferir override, luego OCR)
  const discountParsed = parseDiscount(input.discount_text, invoiceUnitPriceRaw * qtyInvoice);
  const discountPct = input.discount_pct_override ?? discountParsed.percent;
  
  // Validar rango de descuento
  const validDiscountPct = Math.max(0, Math.min(100, discountPct));
  if (discountPct !== validDiscountPct) {
    reasons.push(`Descuento ajustado de ${discountPct}% a ${validDiscountPct}%`);
  }
  
  // 7. Calcular precio después de descuento
  const unitPriceAfterDiscount = Math.round(unitPriceReal * (1 - validDiscountPct / 100));
  
  // 8. Determinar gross_line (preferir total de línea si existe)
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
  
  // 9. Detectar categoría de impuesto
  const taxCategory = input.tax_category_override ?? detectTaxCategory(input.raw_product_name);
  
  // 10. Sumar impuestos (NUNCA forman parte del costo - SOLO INFORMATIVOS)
  const taxIaba10 = input.tax_iaba_10 ?? 0;
  const taxIaba18 = input.tax_iaba_18 ?? 0;
  const taxIlaVin = input.tax_ila_vin ?? 0;
  const taxIlaCer = input.tax_ila_cer ?? 0;
  const taxIlaLic = input.tax_ila_lic ?? 0;
  const taxesExcluded = taxIaba10 + taxIaba18 + taxIlaVin + taxIlaCer + taxIlaLic;
  
  // 11. Calcular neto para costo (basado en precio después de descuento)
  const netLineForCost = unitPriceAfterDiscount * realUnits;
  
  // 12. Calcular costo unitario neto (= precio después de descuento)
  const netUnitCost = unitPriceAfterDiscount;
  
  // 13. Detectar primero si es flete/gasto
  const isFreight = isFreightLine(input.raw_product_name);
  if (isFreight) {
    status = "EXPENSE";
    reasons.push('Detectado como flete/despacho');
  }
  
  // 14. Validaciones estrictas (solo si no es gasto)
  if (status !== "EXPENSE") {
    if (realUnits <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Unidades reales <= 0');
    }
    
    if (unitPriceReal <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Precio unitario real <= 0');
    }
    
    if (netUnitCost <= 0 && realUnits > 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Costo unitario neto <= 0');
    }
  }
  
  // 15. Normalizar UoM
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
    taxes_excluded_for_cost: taxesExcluded,
    tax_details: {
      iaba_10: taxIaba10 || undefined,
      iaba_18: taxIaba18 || undefined,
      ila_vin: taxIlaVin || undefined,
      ila_cer: taxIlaCer || undefined,
      ila_lic: taxIlaLic || undefined,
    },
    net_line_for_cost: netLineForCost,
    net_unit_cost: netUnitCost,
    status,
    reasons,
    matched_product_id: null,
    matched_product_name: null,
    match_confidence: 0,
    uom_normalized: uomNormalized,
    uom_raw: input.uom_text || '',
  };
}

/**
 * Recalcula una línea cuando cambia un valor editable
 */
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
  const newTaxCategory = updates.tax_category ?? line.tax_category;
  
  // Recalcular precio unitario real
  let newUnitPriceReal = line.invoice_unit_price_raw;
  if (newPackPriced && newMultiplier > 1) {
    newUnitPriceReal = Math.round(line.invoice_unit_price_raw / newMultiplier);
  }
  
  // Recalcular resto de valores
  const newRealUnits = newQty * newMultiplier;
  const newUnitPriceAfterDiscount = Math.round(newUnitPriceReal * (1 - newDiscountPct / 100));
  const newNetLine = newUnitPriceAfterDiscount * newRealUnits;
  const newDiscountAmount = Math.round(newUnitPriceReal * newRealUnits * newDiscountPct / 100);
  
  // Re-evaluar status
  const reasons: string[] = [];
  let status: LineStatus = "OK";
  
  // Preservar estado de EXPENSE o IGNORED
  if (line.status === "EXPENSE") {
    status = "EXPENSE";
  } else if (line.status === "IGNORED") {
    status = "IGNORED";
  } else {
    // Validar solo líneas de inventario
    if (newRealUnits <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Unidades reales <= 0');
    }
    if (newUnitPriceReal <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Precio unitario real <= 0');
    }
    if (newUnitPriceAfterDiscount <= 0 && newRealUnits > 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Costo unitario neto <= 0');
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
    tax_category: newTaxCategory,
    status,
    reasons: status === "EXPENSE" ? line.reasons : reasons,
  };
}

/**
 * Valida si un documento puede ser confirmado
 */
export function validateForConfirmation(lines: ComputedLine[]): {
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
  
  const invalidDiscount = inventoryLines.filter(l => l.discount_pct < 0 || l.discount_pct > 100);
  if (invalidDiscount.length > 0) {
    errors.push(`${invalidDiscount.length} línea(s) con descuento inválido`);
  }
  
  return {
    canConfirm: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Genera resumen de diagnóstico para debugging
 */
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
    taxTotal: number;
    netTotal: number;
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
  
  const totals = {
    grossTotal: lines.reduce((s, l) => s + l.gross_line, 0),
    discountTotal: lines.reduce((s, l) => s + l.discount_amount, 0),
    taxTotal: lines.reduce((s, l) => s + l.taxes_excluded_for_cost, 0),
    netTotal: lines.reduce((s, l) => s + l.net_line_for_cost, 0),
  };
  
  return {
    summary,
    totals,
    validation: validateForConfirmation(lines),
  };
}
