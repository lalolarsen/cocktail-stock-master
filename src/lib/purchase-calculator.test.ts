/**
 * Tests for purchase-calculator.ts — single source of truth for invoice calculations.
 *
 * Coverage:
 *  - parseNumber            (formato chileno, decimales, edge cases)
 *  - detectPackMultiplier   (patrones NpcxM, LAT, PF, UN, genérico)
 *  - isFreightLine          (flete keywords)
 *  - detectTaxCategory      (heurística por nombre de producto)
 *  - normalizeUom           (mapeo de abreviaturas)
 *  - parseDiscount          (% y monto fijo desde texto o número)
 *  - computePurchaseLine    (flujo completo: precio, descuento, impuesto, unidades)
 *  - applyTaxProration      (prorrateo por categoría, redondeo, edge cases)
 *  - validateForConfirmation (errores de confirmación)
 */

import { describe, it, expect } from "vitest";
import {
  parseNumber,
  detectPackMultiplier,
  isFreightLine,
  detectTaxCategory,
  normalizeUom,
  parseDiscount,
  computePurchaseLine,
  applyTaxProration,
  validateForConfirmation,
  createEmptyHeaderTaxTotals,
  normalizeTaxCategory,
  type ComputeLineInput,
  type ComputedLine,
  type HeaderTaxTotals,
} from "./purchase-calculator";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ComputeLineInput> = {}): ComputeLineInput {
  return {
    id: "test-id",
    raw_product_name: "Producto Test",
    qty_text: "10",
    unit_price_text: "1000",
    line_total_text: null,
    discount_text: null,
    discount_mode: "INCLUDED_IN_PRICE",
    ...overrides,
  };
}

function emptyTaxTotals(): HeaderTaxTotals {
  return createEmptyHeaderTaxTotals();
}

// ─────────────────────────────────────────────────────────────────────────────
// parseNumber
// ─────────────────────────────────────────────────────────────────────────────

describe("parseNumber", () => {
  it("retorna null para null/undefined", () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it("pasa numbers directamente", () => {
    expect(parseNumber(1234)).toBe(1234);
    expect(parseNumber(0)).toBe(0);
  });

  it("retorna null para NaN", () => {
    expect(parseNumber(NaN)).toBeNull();
  });

  it("parsea enteros simples", () => {
    expect(parseNumber("1000")).toBe(1000);
    expect(parseNumber("0")).toBe(0);
  });

  it("elimina separador de miles chileno (puntos)", () => {
    expect(parseNumber("1.234")).toBe(1234);
    expect(parseNumber("1.234.567")).toBe(1234567);
  });

  it("convierte coma decimal a punto", () => {
    expect(parseNumber("1234,50")).toBe(1234.5);
  });

  it("elimina signo $", () => {
    expect(parseNumber("$1.234")).toBe(1234);
    expect(parseNumber("$ 5.000")).toBe(5000);
  });

  it("elimina espacios", () => {
    expect(parseNumber("  500  ")).toBe(500);
  });

  it("retorna null para texto no numérico", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTaxCategory
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeTaxCategory", () => {
  it("convierte aliases legacy al nuevo formato", () => {
    expect(normalizeTaxCategory("IABA10")).toBe("IABA_10");
    expect(normalizeTaxCategory("IABA18")).toBe("IABA_18");
    expect(normalizeTaxCategory("ILA_VINO_20_5")).toBe("ILA_VINO_205");
    expect(normalizeTaxCategory("ILA_CERVEZA_20_5")).toBe("ILA_CERVEZA_205");
    expect(normalizeTaxCategory("ILA_DESTILADOS_31_5")).toBe("ILA_DESTILADOS_315");
  });

  it("pasa categorías ya normalizadas sin cambio", () => {
    expect(normalizeTaxCategory("NONE")).toBe("NONE");
    expect(normalizeTaxCategory("IABA_10")).toBe("IABA_10");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectPackMultiplier
// ─────────────────────────────────────────────────────────────────────────────

describe("detectPackMultiplier", () => {
  it("detecta patrón NpcxM con alta confianza", () => {
    const r = detectPackMultiplier("Cerveza 6PCX4");
    expect(r.multiplier).toBe(24);
    expect(r.confidence).toBe("high");
  });

  it("detecta patrón LATxxxXN", () => {
    const r = detectPackMultiplier("LAT250X24 Coca-Cola");
    expect(r.multiplier).toBe(24);
    expect(r.confidence).toBe("high");
  });

  it("detecta patrón NPF (caja PF)", () => {
    const r = detectPackMultiplier("Bebida 24PF");
    expect(r.multiplier).toBe(24);
    expect(r.confidence).toBe("medium");
  });

  it("detecta patrón NUN", () => {
    const r = detectPackMultiplier("Producto 12UN");
    expect(r.multiplier).toBe(12);
    expect(r.confidence).toBe("medium");
  });

  it("detecta NxM genérico", () => {
    const r = detectPackMultiplier("Ron 6x1 Lt");
    expect(r.multiplier).toBe(6);
  });

  it("retorna null para nombre sin patrón de pack", () => {
    const r = detectPackMultiplier("Whisky Johnnie Walker 750ml");
    expect(r.multiplier).toBeNull();
  });

  it("es case-insensitive", () => {
    const r = detectPackMultiplier("cerveza 6pcx4");
    expect(r.multiplier).toBe(24);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isFreightLine
// ─────────────────────────────────────────────────────────────────────────────

describe("isFreightLine", () => {
  it("detecta flete", () => {
    expect(isFreightLine("Flete Santiago")).toBe(true);
  });

  it("detecta despacho", () => {
    expect(isFreightLine("Costo de despacho")).toBe(true);
  });

  it("detecta transporte", () => {
    expect(isFreightLine("Transporte zona norte")).toBe(true);
  });

  it("no detecta falsos positivos en nombres de producto", () => {
    expect(isFreightLine("Cerveza Negra")).toBe(false);
    expect(isFreightLine("Ron Bacardí")).toBe(false);
  });

  it("es case-insensitive", () => {
    expect(isFreightLine("FLETE NORTE")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectTaxCategory
// ─────────────────────────────────────────────────────────────────────────────

describe("detectTaxCategory", () => {
  it("clasifica destilados como ILA_DESTILADOS_315", () => {
    expect(detectTaxCategory("Vodka Absolut 750ml")).toBe("ILA_DESTILADOS_315");
    expect(detectTaxCategory("Whisky Johnnie Walker")).toBe("ILA_DESTILADOS_315");
    expect(detectTaxCategory("Ron Bacardí Blanco")).toBe("ILA_DESTILADOS_315");
    expect(detectTaxCategory("Pisco Control 40°")).toBe("ILA_DESTILADOS_315");
  });

  it("clasifica vino como ILA_VINO_205", () => {
    expect(detectTaxCategory("Vino Sauvignon Blanc")).toBe("ILA_VINO_205");
    expect(detectTaxCategory("Cabernet Reserva Maipo")).toBe("ILA_VINO_205");
    expect(detectTaxCategory("Espumante Brut")).toBe("ILA_VINO_205");
  });

  it("clasifica cerveza como ILA_CERVEZA_205", () => {
    expect(detectTaxCategory("Cerveza Kunstmann Torobayo")).toBe("ILA_CERVEZA_205");
    expect(detectTaxCategory("Beer Heineken 330ml")).toBe("ILA_CERVEZA_205");
  });

  it("clasifica bebidas energéticas como IABA_18", () => {
    expect(detectTaxCategory("Red Bull 250ml")).toBe("IABA_18");
    expect(detectTaxCategory("Monster Energy")).toBe("IABA_18");
  });

  it("clasifica bebidas azucaradas como IABA_10", () => {
    expect(detectTaxCategory("Bebida Gaseosa 1,5L")).toBe("IABA_10");
    expect(detectTaxCategory("Jugo Néctar Durazno")).toBe("IABA_10");
  });

  it("prioriza destilados sobre genéricos (licor vs bebida)", () => {
    // "licor" es destilado, aunque contenga "bebida" en contexto
    expect(detectTaxCategory("Licor Baileys")).toBe("ILA_DESTILADOS_315");
  });

  it("retorna NONE para productos sin clasificación", () => {
    expect(detectTaxCategory("Sal de Mesa 1kg")).toBe("NONE");
    expect(detectTaxCategory("Servilletas Pack 100")).toBe("NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeUom
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeUom", () => {
  it("normaliza abreviaturas conocidas", () => {
    expect(normalizeUom("cj")).toBe("Caja");
    expect(normalizeUom("un")).toBe("Unidad");
    expect(normalizeUom("bt")).toBe("Botella");
    expect(normalizeUom("lt")).toBe("Litro");
    expect(normalizeUom("ml")).toBe("Mililitro");
    expect(normalizeUom("kg")).toBe("Kilogramo");
    expect(normalizeUom("dz")).toBe("Docena");
  });

  it("retorna 'Unidad' para null/undefined/vacío", () => {
    expect(normalizeUom(null)).toBe("Unidad");
    expect(normalizeUom(undefined)).toBe("Unidad");
    expect(normalizeUom("")).toBe("Unidad");
  });

  it("retorna el valor original para abreviaturas desconocidas", () => {
    expect(normalizeUom("pallet")).toBe("pallet");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseDiscount
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDiscount", () => {
  it("retorna cero para null", () => {
    const r = parseDiscount(null, 10000);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
  });

  it("parsea porcentaje desde string con %", () => {
    const r = parseDiscount("10%", 10000);
    expect(r.percent).toBe(10);
    expect(r.amount).toBe(1000);
  });

  it("parsea porcentaje desde número ≤100", () => {
    const r = parseDiscount(15, 20000);
    expect(r.percent).toBe(15);
    expect(r.amount).toBe(3000);
  });

  it("parsea monto fijo desde número >100", () => {
    const r = parseDiscount(500, 10000);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(500);
  });

  it("parsea monto fijo desde string sin %", () => {
    const r = parseDiscount("2.500", 10000);
    // 2500 > 100, se trata como monto
    expect(r.amount).toBe(2500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computePurchaseLine
// ─────────────────────────────────────────────────────────────────────────────

describe("computePurchaseLine", () => {
  describe("cálculo básico sin descuento ni pack", () => {
    it("calcula correctamente unidades y precio unitario", () => {
      const r = computePurchaseLine(makeInput({
        qty_text: "10",
        unit_price_text: "5000",
        line_total_text: null,
      }));
      expect(r.qty_invoice).toBe(10);
      expect(r.unit_price_real).toBe(5000);
      expect(r.real_units).toBe(10);
      expect(r.gross_line).toBe(50000);
      expect(r.status).toBe("OK");
    });

    it("usa line_total cuando está disponible", () => {
      const r = computePurchaseLine(makeInput({
        qty_text: "5",
        unit_price_text: "1000",
        line_total_text: "4800", // diferente al calculado
      }));
      expect(r.gross_line).toBe(4800);
    });
  });

  describe("multiplicador de empaque", () => {
    it("expande unidades con pack_multiplier_override", () => {
      const r = computePurchaseLine(makeInput({
        raw_product_name: "Cerveza Austral",
        qty_text: "2",
        unit_price_text: "12000",
        pack_multiplier_override: 12,
      }));
      expect(r.pack_multiplier).toBe(12);
      expect(r.real_units).toBe(24);
    });

    it("divide precio unitario cuando pack_priced=true", () => {
      const r = computePurchaseLine(makeInput({
        qty_text: "1",
        unit_price_text: "12000",
        pack_multiplier_override: 12,
        pack_priced_override: true,
      }));
      expect(r.unit_price_real).toBe(1000);
      expect(r.real_units).toBe(12);
    });

    it("detecta automáticamente el multiplicador desde el nombre", () => {
      const r = computePurchaseLine(makeInput({
        raw_product_name: "Cerveza Cristal 12UN",
        qty_text: "5",
        unit_price_text: "2000",
      }));
      expect(r.pack_multiplier).toBe(12);
      expect(r.real_units).toBe(60);
    });
  });

  describe("descuentos", () => {
    it("aplica descuento porcentual", () => {
      const r = computePurchaseLine(makeInput({
        qty_text: "10",
        unit_price_text: "1000",
        discount_pct_override: 10,
      }));
      expect(r.discount_pct).toBe(10);
      expect(r.unit_price_after_discount).toBe(900);
    });

    it("clampea descuento a [0, 100]", () => {
      const r = computePurchaseLine(makeInput({
        discount_pct_override: 150,
      }));
      expect(r.discount_pct).toBe(100);
    });

    it("descuento 0 no cambia el precio", () => {
      const r = computePurchaseLine(makeInput({
        unit_price_text: "5000",
        discount_pct_override: 0,
      }));
      expect(r.unit_price_after_discount).toBe(5000);
    });
  });

  describe("categoría de impuesto", () => {
    it("detecta ILA_DESTILADOS_315 desde el nombre", () => {
      const r = computePurchaseLine(makeInput({
        raw_product_name: "Vodka Absolut 1L",
      }));
      expect(r.tax_category).toBe("ILA_DESTILADOS_315");
      expect(r.tax_rate).toBe(0.315);
    });

    it("respeta tax_category_override", () => {
      const r = computePurchaseLine(makeInput({
        raw_product_name: "Vodka Absolut 1L",
        tax_category_override: "NONE",
      }));
      expect(r.tax_category).toBe("NONE");
      expect(r.tax_rate).toBe(0);
    });
  });

  describe("estado de línea", () => {
    it("marca EXPENSE para líneas de flete", () => {
      const r = computePurchaseLine(makeInput({
        raw_product_name: "Flete zona sur",
        qty_text: "1",
        unit_price_text: "5000",
      }));
      expect(r.status).toBe("EXPENSE");
    });

    it("marca REVIEW_REQUIRED si unidades <= 0", () => {
      const r = computePurchaseLine(makeInput({
        qty_text: "0",
        unit_price_text: "1000",
      }));
      expect(r.status).toBe("REVIEW_REQUIRED");
    });

    it("marca REVIEW_REQUIRED si precio <= 0", () => {
      const r = computePurchaseLine(makeInput({
        qty_text: "10",
        unit_price_text: "0",
      }));
      expect(r.status).toBe("REVIEW_REQUIRED");
    });

    it("marca REVIEW_REQUIRED si pack_priced=true pero multiplicador=1", () => {
      const r = computePurchaseLine(makeInput({
        pack_priced_override: true,
        pack_multiplier_override: 1,
        qty_text: "5",
        unit_price_text: "1000",
      }));
      expect(r.status).toBe("REVIEW_REQUIRED");
    });
  });

  describe("valores de entrada nulos/vacíos", () => {
    it("trata qty null como 0 y marca REVIEW_REQUIRED", () => {
      const r = computePurchaseLine(makeInput({ qty_text: null }));
      expect(r.qty_invoice).toBe(0);
      expect(r.status).toBe("REVIEW_REQUIRED");
    });

    it("trata precio null como 0 y marca REVIEW_REQUIRED", () => {
      const r = computePurchaseLine(makeInput({ unit_price_text: null, line_total_text: null }));
      expect(r.status).toBe("REVIEW_REQUIRED");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyTaxProration
// ─────────────────────────────────────────────────────────────────────────────

describe("applyTaxProration", () => {
  function makeLine(overrides: Partial<ComputedLine> = {}): ComputedLine {
    const base = computePurchaseLine(makeInput({
      raw_product_name: "Vodka Test",
      qty_text: "10",
      unit_price_text: "5000",
      tax_category_override: "ILA_DESTILADOS_315",
    }));
    return { ...base, matched_product_id: "prod-1", ...overrides };
  }

  it("prorratea impuesto entre líneas de misma categoría proporcional al neto", () => {
    const line1 = makeLine({ id: "l1", net_line_for_cost: 30000 });
    const line2 = makeLine({ id: "l2", net_line_for_cost: 70000 });

    const taxTotals = emptyTaxTotals();
    taxTotals.ila_destilados_315_total = 10000;

    const { lines, diagnostics } = applyTaxProration([line1, line2], taxTotals);

    const l1 = lines.find(l => l.id === "l1")!;
    const l2 = lines.find(l => l.id === "l2")!;

    // l1 tiene 30% del neto → 3000; l2 tiene 70% → 7000
    expect(l1.specific_tax_amount).toBe(3000);
    expect(l2.specific_tax_amount).toBe(7000);
    // La suma debe cuadrar exactamente con el header
    expect(l1.specific_tax_amount + l2.specific_tax_amount).toBe(10000);
    expect(diagnostics[0].is_valid).toBe(true);
  });

  it("calcula impuesto por tasa (fallback CALCULATED) cuando header total = 0", () => {
    // Cuando no hay total en header, la función usa la tasa como estimador.
    // ILA_DESTILADOS_315 = 31.5% → 50000 * 0.315 = 15750
    const line = makeLine({ id: "l1", net_line_for_cost: 50000 });
    const taxTotals = emptyTaxTotals(); // todos en cero

    const { lines, diagnostics } = applyTaxProration([line], taxTotals);
    expect(lines[0].specific_tax_amount).toBe(15750);
    expect(lines[0].specific_tax_source).toBe("CALCULATED");

    const diag = diagnostics.find(d => d.category === "ILA_DESTILADOS_315");
    expect(diag?.is_valid).toBe(true);
    expect(diag?.error_message).toContain("usando cálculo por tasa");
  });

  it("genera diagnóstico de error cuando hay impuesto en header sin líneas asignadas", () => {
    // Línea de VINO, pero el impuesto en header es para DESTILADOS
    const line = computePurchaseLine(makeInput({
      raw_product_name: "Vino Merlot",
      tax_category_override: "ILA_VINO_205",
      qty_text: "10",
      unit_price_text: "3000",
    }));
    const taxTotals = emptyTaxTotals();
    taxTotals.ila_destilados_315_total = 5000; // sin líneas de destilados

    const { diagnostics } = applyTaxProration([line], taxTotals);
    const destDiag = diagnostics.find(d => d.category === "ILA_DESTILADOS_315");
    expect(destDiag?.is_valid).toBe(false);
    expect(destDiag?.error_message).toBeDefined();
  });

  it("el ajuste de redondeo garantiza que la suma sea exacta", () => {
    // 3 líneas iguales, impuesto indivisible exactamente por 3
    const lines = [1, 2, 3].map(i =>
      makeLine({ id: `l${i}`, net_line_for_cost: 10000 })
    );
    const taxTotals = emptyTaxTotals();
    taxTotals.ila_destilados_315_total = 100; // 100/3 = 33.33...

    const { lines: result } = applyTaxProration(lines, taxTotals);
    const total = result.reduce((s, l) => s + l.specific_tax_amount, 0);
    expect(total).toBe(100);
  });

  it("ignora líneas EXPENSE y IGNORED en el prorrateo", () => {
    const lineOK = makeLine({ id: "l1", net_line_for_cost: 50000, status: "OK" });
    const lineExpense = makeLine({ id: "l2", net_line_for_cost: 50000, status: "EXPENSE" });

    const taxTotals = emptyTaxTotals();
    taxTotals.ila_destilados_315_total = 1000;

    const { lines } = applyTaxProration([lineOK, lineExpense], taxTotals);
    const ok = lines.find(l => l.id === "l1")!;
    const exp = lines.find(l => l.id === "l2")!;

    expect(ok.specific_tax_amount).toBe(1000); // todo va a la línea OK
    expect(exp.specific_tax_amount).toBe(0);   // expense no recibe impuesto
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateForConfirmation
// ─────────────────────────────────────────────────────────────────────────────

describe("validateForConfirmation", () => {
  function makeOKLine(id: string): ComputedLine {
    return {
      ...computePurchaseLine(makeInput({ id, qty_text: "5", unit_price_text: "2000" })),
      matched_product_id: "prod-1",
      status: "OK",
    };
  }

  it("canConfirm=true con líneas OK y producto asignado", () => {
    const result = validateForConfirmation([makeOKLine("l1")]);
    expect(result.canConfirm).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("error si hay líneas REVIEW_REQUIRED", () => {
    const line = makeOKLine("l1");
    line.status = "REVIEW_REQUIRED";
    const result = validateForConfirmation([line]);
    expect(result.canConfirm).toBe(false);
    expect(result.errors.some(e => e.includes("revisión"))).toBe(true);
  });

  it("error si línea OK no tiene producto asignado", () => {
    const line = makeOKLine("l1");
    line.matched_product_id = null;
    const result = validateForConfirmation([line]);
    expect(result.canConfirm).toBe(false);
    expect(result.errors.some(e => e.includes("sin producto"))).toBe(true);
  });

  it("error si línea OK tiene unidades=0", () => {
    const line = makeOKLine("l1");
    line.real_units = 0;
    const result = validateForConfirmation([line]);
    expect(result.canConfirm).toBe(false);
    expect(result.errors.some(e => e.includes("unidades reales = 0"))).toBe(true);
  });

  it("error si línea OK tiene precio=0", () => {
    const line = makeOKLine("l1");
    line.unit_price_real = 0;
    const result = validateForConfirmation([line]);
    expect(result.canConfirm).toBe(false);
    expect(result.errors.some(e => e.includes("precio unitario = 0"))).toBe(true);
  });

  it("error si prorrateo no cuadra con header", () => {
    const line = makeOKLine("l1");
    line.tax_category = "ILA_DESTILADOS_315";
    line.specific_tax_amount = 0; // no prorrateado

    const taxTotals = emptyTaxTotals();
    taxTotals.ila_destilados_315_total = 5000;

    const result = validateForConfirmation([line], taxTotals);
    expect(result.canConfirm).toBe(false);
    expect(result.errors.some(e => e.includes("no cuadra"))).toBe(true);
  });

  it("canConfirm=true cuando el prorrateo cuadra con header", () => {
    const line = makeOKLine("l1");
    line.tax_category = "ILA_DESTILADOS_315";
    line.specific_tax_amount = 5000; // coincide con header

    const taxTotals = emptyTaxTotals();
    taxTotals.ila_destilados_315_total = 5000;

    const result = validateForConfirmation([line], taxTotals);
    expect(result.canConfirm).toBe(true);
  });

  it("líneas EXPENSE son ignoradas en validación de producto asignado", () => {
    const freight = makeOKLine("l-freight");
    freight.status = "EXPENSE";
    freight.matched_product_id = null;
    const result = validateForConfirmation([freight]);
    expect(result.canConfirm).toBe(true);
  });

  it("acumula múltiples errores simultáneamente", () => {
    const l1 = makeOKLine("l1");
    l1.status = "REVIEW_REQUIRED";
    const l2 = makeOKLine("l2");
    l2.matched_product_id = null;
    const result = validateForConfirmation([l1, l2]);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.canConfirm).toBe(false);
  });
});
