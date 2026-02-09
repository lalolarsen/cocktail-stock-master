/**
 * MOTOR ÚNICO DE CÁLCULO - SINGLE SOURCE OF TRUTH
 * DiStock Invoice Reader - Stabilization Mode
 * 
 * Este módulo es la ÚNICA fuente de verdad para todos los cálculos de líneas de compra.
 * Cualquier cifra visible en UI debe venir de este motor.
 * NO se permiten cálculos ad-hoc en otros archivos.
 * 
 * ACTUALIZADO: Sistema de prorrateo de impuestos específicos por categoría
 */

// ============================================================================
// TIPOS
// ============================================================================

export type LineStatus = "OK" | "REVIEW_REQUIRED" | "EXPENSE" | "IGNORED";

export type DiscountMode = "INCLUDED_IN_PRICE" | "APPLY_TO_GROSS" | "GLOBAL_PRORATE";

export type TaxCategory = 
  | "NONE" 
  | "IABA_10" 
  | "IABA_18" 
  | "ILA_VINO_205" 
  | "ILA_CERVEZA_205" 
  | "ILA_DESTILADOS_315";

// Legacy aliases for backwards compatibility
export const TAX_CATEGORY_LEGACY_MAP: Record<string, TaxCategory> = {
  'IABA10': 'IABA_10',
  'IABA18': 'IABA_18',
  'ILA_VINO_20_5': 'ILA_VINO_205',
  'ILA_CERVEZA_20_5': 'ILA_CERVEZA_205',
  'ILA_DESTILADOS_31_5': 'ILA_DESTILADOS_315',
};

export function normalizeTaxCategory(category: string): TaxCategory {
  if (TAX_CATEGORY_LEGACY_MAP[category]) return TAX_CATEGORY_LEGACY_MAP[category];
  return category as TaxCategory;
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

// Tasas para cálculo informativo (cuando NO hay totales de header)
export const TAX_RATES: Record<TaxCategory, number> = {
  NONE: 0,
  IABA_10: 0.10,
  IABA_18: 0.18,
  ILA_VINO_205: 0.205,
  ILA_CERVEZA_205: 0.205,
  ILA_DESTILADOS_315: 0.315,
};

// ============================================================================
// TIPOS DE PRORRATEO
// ============================================================================

export interface HeaderTaxTotals {
  iaba_10_total: number;
  iaba_18_total: number;
  ila_vino_205_total: number;
  ila_cerveza_205_total: number;
  ila_destilados_315_total: number;
  // Metadatos
  sources: {
    iaba_10_source?: "extracted" | "missing";
    iaba_18_source?: "extracted" | "missing";
    ila_vino_205_source?: "extracted" | "missing";
    ila_cerveza_205_source?: "extracted" | "missing";
    ila_destilados_315_source?: "extracted" | "missing";
  };
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

// ============================================================================
// LINEA COMPUTADA
// ============================================================================

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
  
  // Clasificación tributaria (editable)
  tax_category: TaxCategory;
  tax_rate: number; // Tasa aplicable según tax_category (informativo)
  taxes_excluded_for_cost: number; // DEPRECATED
  tax_details: {
    iva?: number;
    iaba_10?: number;
    iaba_18?: number;
    ila_vin?: number;
    ila_cer?: number;
    ila_lic?: number;
  };
  
  // Cálculos de neto (SIN impuestos específicos)
  net_line_for_cost: number; // unit_price_after_discount * real_units (neto puro)
  net_unit_cost: number; // unit_price_after_discount (neto puro)
  
  // PRORRATEO: Impuestos específicos prorrateados desde header
  specific_tax_amount: number; // Monto prorrateado para esta línea
  specific_tax_source: "PRORATION" | "CALCULATED" | "NONE"; // Origen del impuesto
  
  // INVENTARIO: Costo incluyendo impuestos específicos
  inventory_cost_line: number; // net_line_for_cost + specific_tax_amount
  inventory_unit_cost: number; // inventory_cost_line / real_units (USAR PARA CPP)
  
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
  // NUEVO: Totales de impuestos por categoría
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
  // Impuestos por línea (si vienen en la factura - legacy)
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

// Keywords para clasificación de impuestos por producto (heurística)
const TAX_CATEGORY_KEYWORDS: Record<TaxCategory, string[]> = {
  NONE: [],
  IABA_10: ['bebida', 'gaseosa', 'jugo', 'agua mineral', 'limonada', 'néctar'],
  IABA_18: ['energy', 'red bull', 'monster', 'energética', 'hipertónica', 'energizante'],
  ILA_VINO_205: ['vino', 'sauvignon', 'cabernet', 'merlot', 'chardonnay', 'carmenere', 'malbec', 'pinot', 'espumante', 'champaña', 'champagne'],
  ILA_CERVEZA_205: ['cerveza', 'beer', 'heineken', 'corona', 'kunstmann', 'austral', 'cristal', 'escudo', 'becker', 'stella', 'budweiser', 'dorada'],
  ILA_DESTILADOS_315: ['vodka', 'gin', 'ron', 'whisky', 'whiskey', 'pisco', 'tequila', 'aguardiente', 'brandy', 'cognac', 'licor', 'aperol', 'campari', 'jagermeister'],
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
    return { multiplier: parseInt(xMatch[1]), confidence: 'low', pattern: xMatch[0] };
  }
  
  // Patrón 6: NxM genérico (12x1, 6x4)
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

/**
 * Detecta si una línea es flete/despacho
 */
export function isFreightLine(productName: string): boolean {
  const lower = productName.toLowerCase();
  return FREIGHT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Detecta categoría de impuesto según nombre del producto (heurística)
 */
export function detectTaxCategory(productName: string): TaxCategory {
  const lower = productName.toLowerCase();
  
  // Orden de prioridad: destilados > vino > cerveza > iaba18 > iaba10
  for (const kw of TAX_CATEGORY_KEYWORDS.ILA_DESTILADOS_315) {
    if (lower.includes(kw)) return 'ILA_DESTILADOS_315';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.ILA_VINO_205) {
    if (lower.includes(kw)) return 'ILA_VINO_205';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.ILA_CERVEZA_205) {
    if (lower.includes(kw)) return 'ILA_CERVEZA_205';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.IABA_18) {
    if (lower.includes(kw)) return 'IABA_18';
  }
  for (const kw of TAX_CATEGORY_KEYWORDS.IABA_10) {
    if (lower.includes(kw)) return 'IABA_10';
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
 */
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

/**
 * Obtiene etiqueta legible para categoría de impuesto
 */
export function getTaxCategoryLabel(category: TaxCategory): string {
  const labels: Record<TaxCategory, string> = {
    NONE: 'Sin impuesto',
    IABA_10: 'IABA 10%',
    IABA_18: 'IABA 18%',
    ILA_VINO_205: 'ILA Vino 20,5%',
    ILA_CERVEZA_205: 'ILA Cerveza 20,5%',
    ILA_DESTILADOS_315: 'ILA Destilados 31,5%',
  };
  return labels[category] || category;
}

/**
 * Crea header tax totals vacío
 */
export function createEmptyHeaderTaxTotals(): HeaderTaxTotals {
  return {
    iaba_10_total: 0,
    iaba_18_total: 0,
    ila_vino_205_total: 0,
    ila_cerveza_205_total: 0,
    ila_destilados_315_total: 0,
    sources: {
      iaba_10_source: "missing",
      iaba_18_source: "missing",
      ila_vino_205_source: "missing",
      ila_cerveza_205_source: "missing",
      ila_destilados_315_source: "missing",
    },
  };
}

// ============================================================================
// FUNCIÓN PRINCIPAL: computePurchaseLine
// ============================================================================

/**
 * MOTOR ÚNICO DE CÁLCULO
 * Esta función calcula TODOS los valores derivados de una línea de compra.
 * Es determinística y pura (mismo input = mismo output).
 * 
 * NOTA: specific_tax_amount se inicializa en 0 aquí.
 * El prorrateo real se aplica después con applyTaxProration()
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
  
  // 3. Determinar si precio viene por pack
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
  
  // 6. Parsear descuento
  const discountParsed = parseDiscount(input.discount_text, invoiceUnitPriceRaw * qtyInvoice);
  const discountPct = input.discount_pct_override ?? discountParsed.percent;
  
  const validDiscountPct = Math.max(0, Math.min(100, discountPct));
  if (discountPct !== validDiscountPct) {
    reasons.push(`Descuento ajustado de ${discountPct}% a ${validDiscountPct}%`);
  }
  
  // 7. Calcular precio después de descuento
  const unitPriceAfterDiscount = Math.round(unitPriceReal * (1 - validDiscountPct / 100));
  
  // 8. Determinar gross_line
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
  const taxRate = TAX_RATES[taxCategory] || 0;
  
  // 10. Calcular neto para costo (SIN impuestos)
  const netLineForCost = unitPriceAfterDiscount * realUnits;
  const netUnitCost = unitPriceAfterDiscount;
  
  // 11. Impuestos específicos: inicializar en 0
  // El prorrateo real se aplica después con applyTaxProration()
  const specificTaxAmount = 0;
  const inventoryCostLine = netLineForCost; // Sin impuestos por ahora
  const inventoryUnitCost = realUnits > 0 ? Math.round(inventoryCostLine / realUnits) : 0;
  
  // 12. Detectar si es flete/gasto
  const isFreight = isFreightLine(input.raw_product_name);
  if (isFreight) {
    status = "EXPENSE";
    reasons.push('Detectado como flete/despacho');
  }
  
  // 13. Validaciones estrictas (solo si no es gasto)
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
  
  // 14. Normalizar UoM
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
    tax_rate: taxRate,
    taxes_excluded_for_cost: 0,
    tax_details: {},
    net_line_for_cost: netLineForCost,
    net_unit_cost: netUnitCost,
    specific_tax_amount: specificTaxAmount,
    specific_tax_source: "NONE",
    inventory_cost_line: inventoryCostLine,
    inventory_unit_cost: inventoryUnitCost,
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
// PRORRATEO DE IMPUESTOS POR CATEGORÍA
// ============================================================================

/**
 * Obtiene el campo de HeaderTaxTotals para una categoría
 */
function getTaxTotalForCategory(taxTotals: HeaderTaxTotals, category: TaxCategory): number {
  switch (category) {
    case 'IABA_10': return taxTotals.iaba_10_total;
    case 'IABA_18': return taxTotals.iaba_18_total;
    case 'ILA_VINO_205': return taxTotals.ila_vino_205_total;
    case 'ILA_CERVEZA_205': return taxTotals.ila_cerveza_205_total;
    case 'ILA_DESTILADOS_315': return taxTotals.ila_destilados_315_total;
    default: return 0;
  }
}

/**
 * Aplica prorrateo de impuestos específicos a las líneas
 * 
 * REGLAS:
 * 1. Agrupa líneas por tax_category
 * 2. Calcula base neta por categoría (sum net_line_for_cost)
 * 3. Prorratea el total de header según participación de cada línea
 * 4. Ajusta redondeo en la línea con mayor neto
 * 5. Si base = 0 pero hay impuesto, marca REVIEW_REQUIRED
 */
export function applyTaxProration(
  lines: ComputedLine[],
  headerTaxTotals: HeaderTaxTotals
): { 
  lines: ComputedLine[]; 
  diagnostics: ProrationDiagnostic[];
} {
  const diagnostics: ProrationDiagnostic[] = [];
  const categories: TaxCategory[] = [
    'IABA_10', 'IABA_18', 'ILA_VINO_205', 'ILA_CERVEZA_205', 'ILA_DESTILADOS_315'
  ];
  
  // Clonar líneas para no mutar
  let resultLines = lines.map(l => ({ ...l }));
  
  for (const category of categories) {
    const totalFromHeader = getTaxTotalForCategory(headerTaxTotals, category);
    
    // Filtrar líneas de inventario (no gasto) con esta categoría
    const categoryLines = resultLines.filter(
      l => l.tax_category === category && l.status !== 'EXPENSE' && l.status !== 'IGNORED'
    );
    
    if (categoryLines.length === 0) {
      // No hay líneas para esta categoría
      if (totalFromHeader > 0) {
        diagnostics.push({
          category,
          total_from_header: totalFromHeader,
          base_net_amount: 0,
          lines_count: 0,
          sum_prorated: 0,
          rounding_adjustment: 0,
          is_valid: false,
          error_message: `Impuesto de header ($${totalFromHeader.toLocaleString('es-CL')}) sin líneas asignadas`,
        });
      }
      continue;
    }
    
    // Calcular base neta
    const baseNetAmount = categoryLines.reduce((sum, l) => sum + l.net_line_for_cost, 0);
    
    if (totalFromHeader === 0) {
      // No hay impuesto en header para esta categoría
      // Calcular estimado usando tasa (modo fallback)
      const rate = TAX_RATES[category];
      categoryLines.forEach(line => {
        const idx = resultLines.findIndex(l => l.id === line.id);
        if (idx >= 0) {
          const estimatedTax = Math.round(line.net_line_for_cost * rate);
          resultLines[idx] = {
            ...resultLines[idx],
            specific_tax_amount: estimatedTax,
            specific_tax_source: "CALCULATED",
            inventory_cost_line: line.net_line_for_cost + estimatedTax,
            inventory_unit_cost: line.real_units > 0 
              ? Math.round((line.net_line_for_cost + estimatedTax) / line.real_units) 
              : 0,
          };
        }
      });
      
      diagnostics.push({
        category,
        total_from_header: 0,
        base_net_amount: baseNetAmount,
        lines_count: categoryLines.length,
        sum_prorated: categoryLines.reduce((s, l) => s + Math.round(l.net_line_for_cost * TAX_RATES[category]), 0),
        rounding_adjustment: 0,
        is_valid: true,
        error_message: "Sin total de header - usando cálculo por tasa",
      });
      continue;
    }
    
    if (baseNetAmount === 0) {
      // Base = 0 pero hay impuesto -> marcar REVIEW_REQUIRED
      categoryLines.forEach(line => {
        const idx = resultLines.findIndex(l => l.id === line.id);
        if (idx >= 0) {
          resultLines[idx] = {
            ...resultLines[idx],
            status: "REVIEW_REQUIRED",
            reasons: [...resultLines[idx].reasons, `No se puede prorratear impuesto ${category}: base neta = 0`],
          };
        }
      });
      
      diagnostics.push({
        category,
        total_from_header: totalFromHeader,
        base_net_amount: 0,
        lines_count: categoryLines.length,
        sum_prorated: 0,
        rounding_adjustment: 0,
        is_valid: false,
        error_message: "Base neta = 0, no se puede prorratear",
      });
      continue;
    }
    
    // Prorratear impuesto
    const proratedAmounts: { lineId: string; amount: number; netAmount: number }[] = [];
    
    categoryLines.forEach(line => {
      const proportion = line.net_line_for_cost / baseNetAmount;
      const proratedRaw = totalFromHeader * proportion;
      const proratedRounded = Math.round(proratedRaw);
      
      proratedAmounts.push({
        lineId: line.id,
        amount: proratedRounded,
        netAmount: line.net_line_for_cost,
      });
    });
    
    // Ajuste de redondeo
    const sumProrated = proratedAmounts.reduce((s, p) => s + p.amount, 0);
    const diff = totalFromHeader - sumProrated;
    
    if (diff !== 0) {
      // Aplicar diferencia a la línea con mayor neto
      const maxLine = proratedAmounts.reduce((max, p) => 
        p.netAmount > max.netAmount ? p : max
      , proratedAmounts[0]);
      maxLine.amount += diff;
    }
    
    // Aplicar montos prorrateados a las líneas
    proratedAmounts.forEach(({ lineId, amount }) => {
      const idx = resultLines.findIndex(l => l.id === lineId);
      if (idx >= 0) {
        const line = resultLines[idx];
        const newInventoryCostLine = line.net_line_for_cost + amount;
        const newInventoryUnitCost = line.real_units > 0 
          ? Math.round(newInventoryCostLine / line.real_units) 
          : 0;
        
        resultLines[idx] = {
          ...line,
          specific_tax_amount: amount,
          specific_tax_source: "PRORATION",
          inventory_cost_line: newInventoryCostLine,
          inventory_unit_cost: newInventoryUnitCost,
        };
      }
    });
    
    diagnostics.push({
      category,
      total_from_header: totalFromHeader,
      base_net_amount: baseNetAmount,
      lines_count: categoryLines.length,
      sum_prorated: proratedAmounts.reduce((s, p) => s + p.amount, 0),
      rounding_adjustment: diff,
      is_valid: true,
    });
  }
  
  return { lines: resultLines, diagnostics };
}

// ============================================================================
// RECALCULO DE LÍNEA
// ============================================================================

/**
 * Recalcula una línea cuando cambia un valor editable
 * NOTA: No aplica prorrateo - eso se hace a nivel de documento
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
  const newTaxRate = TAX_RATES[newTaxCategory] || 0;
  
  // Recalcular precio unitario real
  let newUnitPriceReal = line.invoice_unit_price_raw;
  if (newPackPriced && newMultiplier > 1) {
    newUnitPriceReal = Math.round(line.invoice_unit_price_raw / newMultiplier);
  }
  
  // Recalcular resto de valores netos
  const newRealUnits = newQty * newMultiplier;
  const newUnitPriceAfterDiscount = Math.round(newUnitPriceReal * (1 - newDiscountPct / 100));
  const newNetLine = newUnitPriceAfterDiscount * newRealUnits;
  const newDiscountAmount = Math.round(newUnitPriceReal * newRealUnits * newDiscountPct / 100);
  
  // Impuestos: resetear a 0 (se recalculará con prorrateo a nivel documento)
  // Si cambió la categoría, el prorrateo debe re-ejecutarse
  const categoryChanged = updates.tax_category !== undefined && updates.tax_category !== line.tax_category;
  const specificTaxAmount = categoryChanged ? 0 : line.specific_tax_amount;
  const specificTaxSource = categoryChanged ? "NONE" as const : line.specific_tax_source;
  
  const newInventoryCostLine = newNetLine + specificTaxAmount;
  const newInventoryUnitCost = newRealUnits > 0 ? Math.round(newInventoryCostLine / newRealUnits) : 0;
  
  // Re-evaluar status
  const reasons: string[] = [];
  let status: LineStatus = "OK";
  
  // Preservar estado de EXPENSE o IGNORED
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
    // Si la categoría cambió, marcar para re-prorrateo
    if (categoryChanged) {
      reasons.push(`Categoría cambiada a ${getTaxCategoryLabel(newTaxCategory)} - requiere re-prorrateo`);
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
    tax_rate: newTaxRate,
    specific_tax_amount: specificTaxAmount,
    specific_tax_source: specificTaxSource,
    inventory_cost_line: newInventoryCostLine,
    inventory_unit_cost: newInventoryUnitCost,
    status,
    reasons: status === "EXPENSE" ? line.reasons : reasons,
  };
}

// ============================================================================
// VALIDACIÓN PARA CONFIRMACIÓN
// ============================================================================

/**
 * Valida si un documento puede ser confirmado
 */
export function validateForConfirmation(
  lines: ComputedLine[],
  headerTaxTotals?: HeaderTaxTotals
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
  
  // Validar que todas las líneas de inventario tengan tax_category definida
  const noTaxCategory = inventoryLines.filter(l => !l.tax_category);
  if (noTaxCategory.length > 0) {
    errors.push(`${noTaxCategory.length} línea(s) sin categoría tributaria definida`);
  }
  
  const zeroUnits = inventoryLines.filter(l => l.real_units <= 0);
  if (zeroUnits.length > 0) {
    errors.push(`${zeroUnits.length} línea(s) con unidades reales = 0`);
  }
  
  const zeroPrice = inventoryLines.filter(l => l.unit_price_real <= 0);
  if (zeroPrice.length > 0) {
    errors.push(`${zeroPrice.length} línea(s) con precio unitario = 0`);
  }
  
  // Validar prorrateo si hay totales de header
  if (headerTaxTotals) {
    const categories: Array<{ key: keyof HeaderTaxTotals; category: TaxCategory }> = [
      { key: 'iaba_10_total', category: 'IABA_10' },
      { key: 'iaba_18_total', category: 'IABA_18' },
      { key: 'ila_vino_205_total', category: 'ILA_VINO_205' },
      { key: 'ila_cerveza_205_total', category: 'ILA_CERVEZA_205' },
      { key: 'ila_destilados_315_total', category: 'ILA_DESTILADOS_315' },
    ];
    
    for (const { key, category } of categories) {
      const headerTotal = headerTaxTotals[key] as number;
      if (headerTotal > 0) {
        const categoryLines = inventoryLines.filter(l => l.tax_category === category);
        const sumProrated = categoryLines.reduce((s, l) => s + l.specific_tax_amount, 0);
        
        if (Math.abs(headerTotal - sumProrated) > 1) {
          errors.push(`Prorrateo de ${getTaxCategoryLabel(category)} no cuadra: header $${headerTotal.toLocaleString('es-CL')} vs prorrateado $${sumProrated.toLocaleString('es-CL')}`);
        }
        
        const baseNet = categoryLines.reduce((s, l) => s + l.net_line_for_cost, 0);
        if (baseNet === 0 && headerTotal > 0) {
          errors.push(`Categoría ${getTaxCategoryLabel(category)}: impuesto $${headerTotal.toLocaleString('es-CL')} pero base neta = 0`);
        }
      }
    }
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
    netTotal: number;
    specificTaxTotal: number;
    inventoryCostTotal: number;
  };
  byCategory: Record<TaxCategory, {
    linesCount: number;
    netTotal: number;
    taxTotal: number;
  }>;
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
    specificTaxTotal: inventoryLines.reduce((s, l) => s + l.specific_tax_amount, 0),
    inventoryCostTotal: inventoryLines.reduce((s, l) => s + l.inventory_cost_line, 0),
  };
  
  const categories: TaxCategory[] = ['NONE', 'IABA_10', 'IABA_18', 'ILA_VINO_205', 'ILA_CERVEZA_205', 'ILA_DESTILADOS_315'];
  const byCategory = {} as Record<TaxCategory, { linesCount: number; netTotal: number; taxTotal: number }>;
  
  for (const cat of categories) {
    const catLines = inventoryLines.filter(l => l.tax_category === cat);
    byCategory[cat] = {
      linesCount: catLines.length,
      netTotal: catLines.reduce((s, l) => s + l.net_line_for_cost, 0),
      taxTotal: catLines.reduce((s, l) => s + l.specific_tax_amount, 0),
    };
  }
  
  return {
    summary,
    totals,
    byCategory,
    validation: validateForConfirmation(lines, header.tax_totals),
  };
}
