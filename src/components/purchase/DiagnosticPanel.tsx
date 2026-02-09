import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Bug, Copy, Check, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import type { ComputedLine, HeaderTaxTotals, ProrationDiagnostic, TaxCategory } from "@/lib/purchase-calculator";
import { getTaxCategoryLabel } from "@/lib/purchase-calculator";

interface DiagnosticPanelProps {
  rawExtraction: Record<string, unknown> | null;
  computedLines: ComputedLine[];
  headerTaxTotals?: HeaderTaxTotals | null;
  prorationDiagnostics?: ProrationDiagnostic[];
  className?: string;
}

export function DiagnosticPanel({ 
  rawExtraction, 
  computedLines, 
  headerTaxTotals,
  prorationDiagnostics,
  className 
}: DiagnosticPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<"raw" | "computed" | "tax" | null>(null);

  const copyToClipboard = async (type: "raw" | "computed" | "tax") => {
    let data;
    if (type === "raw") data = rawExtraction;
    else if (type === "computed") data = computedLines;
    else data = { headerTaxTotals, prorationDiagnostics };
    
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  // Summary stats
  const summary = {
    total: computedLines.length,
    ok: computedLines.filter(l => l.status === "OK").length,
    review: computedLines.filter(l => l.status === "REVIEW_REQUIRED").length,
    expense: computedLines.filter(l => l.status === "EXPENSE").length,
    ignored: computedLines.filter(l => l.status === "IGNORED").length,
  };

  // Tax category distribution
  const inventoryLines = computedLines.filter(l => l.status === "OK");
  const taxByCat: Record<TaxCategory, { count: number; netTotal: number; taxTotal: number }> = {
    NONE: { count: 0, netTotal: 0, taxTotal: 0 },
    IABA_10: { count: 0, netTotal: 0, taxTotal: 0 },
    IABA_18: { count: 0, netTotal: 0, taxTotal: 0 },
    ILA_VINO_205: { count: 0, netTotal: 0, taxTotal: 0 },
    ILA_CERVEZA_205: { count: 0, netTotal: 0, taxTotal: 0 },
    ILA_DESTILADOS_315: { count: 0, netTotal: 0, taxTotal: 0 },
  };
  
  inventoryLines.forEach(l => {
    if (taxByCat[l.tax_category]) {
      taxByCat[l.tax_category].count++;
      taxByCat[l.tax_category].netTotal += l.net_line_for_cost;
      taxByCat[l.tax_category].taxTotal += l.specific_tax_amount;
    }
  });

  return (
    <Card className={className}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                Diagnóstico (Admin/Developer)
              </span>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 text-xs">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                    OK: {summary.ok}
                  </Badge>
                  {summary.review > 0 && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                      REV: {summary.review}
                    </Badge>
                  )}
                  {summary.expense > 0 && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                      GASTO: {summary.expense}
                    </Badge>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Header Tax Totals (from document) */}
            {headerTaxTotals && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">header_tax_totals (del documento)</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard("tax")}
                    className="h-7 text-xs"
                  >
                    {copied === "tax" ? (
                      <Check className="h-3 w-3 mr-1 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Copiar
                  </Button>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs space-y-1">
                  <div className="grid grid-cols-2 gap-1">
                    <span>IABA 10%:</span>
                    <span className="text-right font-mono">
                      {formatCLP(headerTaxTotals.iaba_10_total)}
                      <span className="text-muted-foreground ml-1">
                        ({headerTaxTotals.sources.iaba_10_source || "?"})
                      </span>
                    </span>
                    <span>IABA 18%:</span>
                    <span className="text-right font-mono">
                      {formatCLP(headerTaxTotals.iaba_18_total)}
                      <span className="text-muted-foreground ml-1">
                        ({headerTaxTotals.sources.iaba_18_source || "?"})
                      </span>
                    </span>
                    <span>ILA Vino 20,5%:</span>
                    <span className="text-right font-mono">
                      {formatCLP(headerTaxTotals.ila_vino_205_total)}
                    </span>
                    <span>ILA Cerveza 20,5%:</span>
                    <span className="text-right font-mono">
                      {formatCLP(headerTaxTotals.ila_cerveza_205_total)}
                    </span>
                    <span>ILA Destilados 31,5%:</span>
                    <span className="text-right font-mono">
                      {formatCLP(headerTaxTotals.ila_destilados_315_total)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Proration Diagnostics */}
            {prorationDiagnostics && prorationDiagnostics.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Diagnóstico de Prorrateo</span>
                <div className="space-y-2">
                  {prorationDiagnostics.map((diag, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg text-xs ${
                        diag.is_valid 
                          ? "bg-green-50 border border-green-200" 
                          : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{getTaxCategoryLabel(diag.category)}</span>
                        {diag.is_valid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1 font-mono">
                        <span>Total Header:</span>
                        <span className="text-right">{formatCLP(diag.total_from_header)}</span>
                        <span>Base Neta:</span>
                        <span className="text-right">{formatCLP(diag.base_net_amount)}</span>
                        <span>Líneas:</span>
                        <span className="text-right">{diag.lines_count}</span>
                        <span>Sum Prorrateado:</span>
                        <span className="text-right">{formatCLP(diag.sum_prorated)}</span>
                        <span>Ajuste Redondeo:</span>
                        <span className="text-right">{formatCLP(diag.rounding_adjustment)}</span>
                      </div>
                      {diag.error_message && (
                        <p className="mt-2 text-red-700">{diag.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tax Category Distribution */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Distribución por Categoría Tributaria</span>
              <div className="bg-muted/50 p-3 rounded-lg text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left pb-2">Categoría</th>
                      <th className="text-right pb-2">Líneas</th>
                      <th className="text-right pb-2">Neto</th>
                      <th className="text-right pb-2">Imp. Prorr.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(taxByCat)
                      .filter(([_, v]) => v.count > 0)
                      .map(([cat, data]) => (
                        <tr key={cat} className="border-t border-muted">
                          <td className="py-1">{getTaxCategoryLabel(cat as TaxCategory)}</td>
                          <td className="text-right font-mono">{data.count}</td>
                          <td className="text-right font-mono">{formatCLP(data.netTotal)}</td>
                          <td className="text-right font-mono text-blue-600">{formatCLP(data.taxTotal)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Raw Extraction JSON */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">raw_extraction</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard("raw")}
                  className="h-7 text-xs"
                >
                  {copied === "raw" ? (
                    <Check className="h-3 w-3 mr-1 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3 mr-1" />
                  )}
                  Copiar
                </Button>
              </div>
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-48 font-mono">
                {JSON.stringify(rawExtraction, null, 2) || "null"}
              </pre>
            </div>

            {/* Computed Lines JSON */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">computed_lines ({computedLines.length})</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard("computed")}
                  className="h-7 text-xs"
                >
                  {copied === "computed" ? (
                    <Check className="h-3 w-3 mr-1 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3 mr-1" />
                  )}
                  Copiar
                </Button>
              </div>
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-64 font-mono">
                {JSON.stringify(computedLines.map(l => ({
                  id: l.id,
                  name: l.raw_product_name.substring(0, 40),
                  status: l.status,
                  tax_category: l.tax_category,
                  qty: l.qty_invoice,
                  mult: l.pack_multiplier,
                  real: l.real_units,
                  net_line: l.net_line_for_cost,
                  specific_tax: l.specific_tax_amount,
                  tax_source: l.specific_tax_source,
                  inv_cost: l.inventory_cost_line,
                  inv_unit_cost: l.inventory_unit_cost,
                  reasons: l.reasons,
                })), null, 2)}
              </pre>
            </div>

            {/* Quick Validation */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1 text-xs">
              <div className="font-medium mb-2">Validación Rápida</div>
              <div className="grid grid-cols-2 gap-1">
                <span>Total Bruto:</span>
                <span className="text-right font-mono">
                  {formatCLP(computedLines.reduce((s, l) => s + l.gross_line, 0))}
                </span>
                <span>Total Descuentos:</span>
                <span className="text-right font-mono text-red-600">
                  -{formatCLP(computedLines.reduce((s, l) => s + l.discount_amount, 0))}
                </span>
                <span>Subtotal Neto:</span>
                <span className="text-right font-mono">
                  {formatCLP(inventoryLines.reduce((s, l) => s + l.net_line_for_cost, 0))}
                </span>
                <span>Imp. Específicos:</span>
                <span className="text-right font-mono text-blue-600">
                  +{formatCLP(inventoryLines.reduce((s, l) => s + l.specific_tax_amount, 0))}
                </span>
                <span className="font-medium">Total Inventario:</span>
                <span className="text-right font-mono font-medium text-green-700">
                  {formatCLP(inventoryLines.reduce((s, l) => s + l.inventory_cost_line, 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
