import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Bug, Copy, Check } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import type { ComputedLine, HeaderTaxTotals, ProrationDiagnostic } from "@/lib/purchase-calculator";

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
  className 
}: DiagnosticPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<"raw" | "computed" | null>(null);

  const copyToClipboard = async (type: "raw" | "computed") => {
    const data = type === "raw" ? rawExtraction : computedLines;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const summary = {
    total: computedLines.length,
    ok: computedLines.filter(l => l.status === "OK").length,
    review: computedLines.filter(l => l.status === "REVIEW_REQUIRED").length,
    expense: computedLines.filter(l => l.status === "EXPENSE").length,
    ignored: computedLines.filter(l => l.status === "IGNORED").length,
  };

  const inventoryLines = computedLines.filter(l => l.status === "OK");

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
                  qty: l.qty_invoice,
                  mult: l.pack_multiplier,
                  real: l.real_units,
                  net_unit_cost: l.net_unit_cost,
                  net_line: l.net_line_for_cost,
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
                <span className="font-medium">Total Neto Inventario:</span>
                <span className="text-right font-mono font-medium text-green-700">
                  {formatCLP(inventoryLines.reduce((s, l) => s + l.net_line_for_cost, 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
