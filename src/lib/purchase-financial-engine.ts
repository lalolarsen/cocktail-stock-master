/**
 * Motor financiero interno para confirmación de importaciones de compra.
 * Construye un JSON financiero, valida cuadratura y produce las entidades a persistir.
 */

export interface ImportLineInput {
  id: string;
  classification: string; // "inventory" | "freight" | "other_expense"
  product_id: string | null;
  units_real: number;
  cost_unit_net: number;
  line_total_net: number | null;
  unit_price_net: number | null;
  qty_invoiced: number;
  detected_multiplier: number;
  tax_category_id: string | null;
  tax_amount: number;
  net_line_amount: number;
  raw_text: string;
}

export interface ImportHeaderInput {
  id: string;
  venue_id: string;
  location_id: string;
  supplier_name: string | null;
  supplier_rut: string | null;
  document_number: string | null;
  document_date: string | null;
  net_subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  iaba_10_total: number;
  iaba_18_total: number;
  ila_vino_total: number;
  ila_cerveza_total: number;
  ila_destilados_total: number;
  specific_taxes_total: number;
}

export interface FinancialSummary {
  inventory_impact: {
    lines_count: number;
    total_units: number;
    total_inventory_net: number;
  };
  tax_credit: {
    iva_credit_19: number;
  };
  specific_taxes: {
    iaba_10: number;
    iaba_18: number;
    ila_vino: number;
    ila_cerveza: number;
    ila_destilados: number;
    total: number;
  };
  operational_expenses: {
    freight_total: number;
    other_total: number;
    total: number;
  };
  accounts_payable: {
    gross_total: number;
  };
  validation: {
    computed_sum: number;
    document_total: number;
    difference: number;
    is_balanced: boolean;
    tolerance: number;
  };
}

const TOLERANCE = 10; // CLP tolerance for rounding

export function buildFinancialSummary(
  header: ImportHeaderInput,
  lines: ImportLineInput[]
): FinancialSummary {
  const invLines = lines.filter(l => l.classification === "inventory");
  const freightLines = lines.filter(l => l.classification === "freight");
  const otherExpLines = lines.filter(l => l.classification === "other_expense");

  const totalInventoryNet = invLines.reduce(
    (s, l) => s + (l.line_total_net || l.units_real * l.cost_unit_net),
    0
  );
  const totalUnits = invLines.reduce((s, l) => s + l.units_real, 0);

  const freightTotal = freightLines.reduce(
    (s, l) => s + (l.line_total_net || l.unit_price_net || 0),
    0
  );
  const otherTotal = otherExpLines.reduce(
    (s, l) => s + (l.line_total_net || l.unit_price_net || 0),
    0
  );

  const ivaCredit = header.vat_amount || 0;
  const specificTaxes = {
    iaba_10: header.iaba_10_total || 0,
    iaba_18: header.iaba_18_total || 0,
    ila_vino: header.ila_vino_total || 0,
    ila_cerveza: header.ila_cerveza_total || 0,
    ila_destilados: header.ila_destilados_total || 0,
    total: header.specific_taxes_total || 0,
  };

  const documentTotal = header.total_amount || 0;

  // Cuadratura: inventario_neto + iva + impuestos_específicos + gastos = total_factura
  const computedSum = Math.round(
    totalInventoryNet + ivaCredit + specificTaxes.total + freightTotal + otherTotal
  );
  const difference = Math.abs(computedSum - documentTotal);

  return {
    inventory_impact: {
      lines_count: invLines.length,
      total_units: totalUnits,
      total_inventory_net: Math.round(totalInventoryNet),
    },
    tax_credit: {
      iva_credit_19: Math.round(ivaCredit),
    },
    specific_taxes: specificTaxes,
    operational_expenses: {
      freight_total: Math.round(freightTotal),
      other_total: Math.round(otherTotal),
      total: Math.round(freightTotal + otherTotal),
    },
    accounts_payable: {
      gross_total: Math.round(documentTotal),
    },
    validation: {
      computed_sum: computedSum,
      document_total: Math.round(documentTotal),
      difference,
      is_balanced: difference <= TOLERANCE,
      tolerance: TOLERANCE,
    },
  };
}
