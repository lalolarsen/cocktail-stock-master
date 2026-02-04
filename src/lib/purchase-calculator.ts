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
  
  // Cálculos automáticos
  real_units: number; // qty_invoice × pack_multiplier
  
  // Totales brutos
  gross_line: number; // preferir line_total_text si existe; si no, unit_price × qty_invoice
  
  // Descuentos
  discount_mode: DiscountMode;
  discount_amount: number;
  
  // Impuestos (excluidos del costo)
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
  net_line_for_cost: number; // gross_line - discount_amount - taxes_excluded_for_cost
  net_unit_cost: number; // net_line_for_cost / real_units
  
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
 * Formatos: 6PCX4, 4PC X 6, LAT250X24, 24PF, X06, 6PF-220CC
 */
export function detectPackMultiplier(productName: string): { multiplier: number | null; confidence: 'high' | 'medium' | 'low' } {
  const name = productName.toUpperCase();
  
  // Patrón 1: NpcxM o NpxM (6pcx4, 4px6)
  const packMatch = name.match(/(\d+)\s*(?:PC|PX)\s*X?\s*(\d+)/i);
  if (packMatch) {
    const result = parseInt(packMatch[1]) * parseInt(packMatch[2]);
    return { multiplier: result, confidence: 'high' };
  }
  
  // Patrón 2: LATXXXXY o similar (LAT250X24)
  const latMatch = name.match(/LAT\d+\s*X\s*(\d+)/i);
  if (latMatch) {
    return { multiplier: parseInt(latMatch[1]), confidence: 'high' };
  }
  
  // Patrón 3: XXPF (24PF = 24 unidades)
  const pfMatch = name.match(/(\d+)\s*PF/i);
  if (pfMatch) {
    return { multiplier: parseInt(pfMatch[1]), confidence: 'medium' };
  }
  
  // Patrón 4: X seguido de número (X06 = 6)
  const xMatch = name.match(/\bX\s*(\d+)\b/i);
  if (xMatch && !name.match(/\d+\s*X\s*\d+/)) {
    // Solo si no es parte de un patrón NxM
    return { multiplier: parseInt(xMatch[1]), confidence: 'low' };
  }
  
  // Patrón 5: NxM genérico (12x6)
  const genericMatch = name.match(/(\d+)\s*X\s*(\d+)/i);
  if (genericMatch) {
    // Verificar que no sea volumen (250x24 podría ser 250ml x 24)
    const first = parseInt(genericMatch[1]);
    const second = parseInt(genericMatch[2]);
    // Si el primer número parece volumen (> 100), asumimos que es pack
    if (first > 100) {
      return { multiplier: second, confidence: 'medium' };
    }
    return { multiplier: first * second, confidence: 'medium' };
  }
  
  return { multiplier: null, confidence: 'low' };
}

/**
 * Detecta si una línea es flete/despacho
 */
export function isFreightLine(productName: string): boolean {
  const lower = productName.toLowerCase();
  return FREIGHT_KEYWORDS.some(kw => lower.includes(kw));
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
  const qtyInvoice = parseNumber(input.qty_text);
  const unitPrice = parseNumber(input.unit_price_text);
  const lineTotal = parseNumber(input.line_total_text);
  
  // 2. Detectar multiplicador de empaque
  let packMultiplier = input.pack_multiplier_override ?? 1;
  if (!input.pack_multiplier_override) {
    const detected = detectPackMultiplier(input.raw_product_name);
    if (detected.multiplier !== null) {
      packMultiplier = detected.multiplier;
      if (detected.confidence === 'low') {
        reasons.push(`Multiplicador detectado (${packMultiplier}) con baja confianza`);
      }
    }
  }
  
  // 3. Calcular unidades reales
  const realUnits = (qtyInvoice ?? 0) * packMultiplier;
  
  // 4. Determinar gross_line (preferir total de línea si existe)
  let grossLine = 0;
  if (lineTotal !== null && lineTotal > 0) {
    grossLine = lineTotal;
  } else if (qtyInvoice !== null && unitPrice !== null) {
    grossLine = qtyInvoice * unitPrice;
    reasons.push('Bruto calculado desde cantidad × precio');
  } else {
    reasons.push('No se pudo determinar el total bruto de línea');
    status = "REVIEW_REQUIRED";
  }
  
  // 5. Parsear descuento según modo
  const discountParsed = parseDiscount(input.discount_text, grossLine);
  let discountAmount = discountParsed.amount;
  
  // 6. Sumar impuestos (NUNCA forman parte del costo)
  const taxIaba10 = input.tax_iaba_10 ?? 0;
  const taxIaba18 = input.tax_iaba_18 ?? 0;
  const taxIlaVin = input.tax_ila_vin ?? 0;
  const taxIlaCer = input.tax_ila_cer ?? 0;
  const taxIlaLic = input.tax_ila_lic ?? 0;
  const taxesExcluded = taxIaba10 + taxIaba18 + taxIlaVin + taxIlaCer + taxIlaLic;
  
  // 7. Calcular neto para costo
  const netLineForCost = grossLine - discountAmount - taxesExcluded;
  
  // 8. Calcular costo unitario neto
  let netUnitCost = 0;
  if (realUnits > 0) {
    netUnitCost = Math.round(netLineForCost / realUnits);
  }
  
  // 9. Detectar primero si es flete/gasto
  const isFreight = isFreightLine(input.raw_product_name);
  if (isFreight) {
    status = "EXPENSE";
    reasons.push('Detectado como flete/despacho');
  }
  
  // 10. Validaciones estrictas (solo si no es gasto)
  if (status !== "EXPENSE") {
    if (realUnits <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Unidades reales <= 0');
    }
    
    if (grossLine <= 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Total bruto <= 0');
    }
    
    if (netUnitCost <= 0 && realUnits > 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Costo unitario neto <= 0');
    }
  }
  
  // 11. Normalizar UoM
  const uomNormalized = normalizeUom(input.uom_text);
  
  return {
    id: input.id,
    raw_product_name: input.raw_product_name,
    qty_invoice: qtyInvoice ?? 0,
    pack_multiplier: packMultiplier,
    real_units: realUnits,
    gross_line: grossLine,
    discount_mode: input.discount_mode,
    discount_amount: discountAmount,
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
    discount_amount: number;
  }>
): ComputedLine {
  const newQty = updates.qty_invoice ?? line.qty_invoice;
  const newMultiplier = updates.pack_multiplier ?? line.pack_multiplier;
  const newDiscount = updates.discount_amount ?? line.discount_amount;
  
  const newRealUnits = newQty * newMultiplier;
  const newNetLine = line.gross_line - newDiscount - line.taxes_excluded_for_cost;
  const newNetUnitCost = newRealUnits > 0 ? Math.round(newNetLine / newRealUnits) : 0;
  
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
    if (newNetUnitCost <= 0 && newRealUnits > 0) {
      status = "REVIEW_REQUIRED";
      reasons.push('Costo unitario neto <= 0');
    }
  }
  
  return {
    ...line,
    qty_invoice: newQty,
    pack_multiplier: newMultiplier,
    real_units: newRealUnits,
    discount_amount: newDiscount,
    net_line_for_cost: newNetLine,
    net_unit_cost: newNetUnitCost,
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
  
  const expenseLines = lines.filter(l => l.status === "EXPENSE");
  // Expenses are OK without product
  
  const zeroUnits = inventoryLines.filter(l => l.real_units <= 0);
  if (zeroUnits.length > 0) {
    errors.push(`${zeroUnits.length} línea(s) con unidades reales = 0`);
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
