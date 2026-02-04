/**
 * ImportSummaryPanel - Detailed summary breakdown
 * 
 * Shows 5-line breakdown as required:
 * 1. Subtotal neto (productos) - inventory only
 * 2. Impuestos específicos (IABA/ILA)
 * 3. IVA (informativo)
 * 4. Gastos operacionales (flete + otros)
 * 5. TOTAL factura
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check, Clock } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import type { ComputedLine, TaxCategory } from "@/lib/purchase-calculator";
import { cn } from "@/lib/utils";

// Tax rates for calculation
const TAX_RATES: Record<TaxCategory, number> = {
  NONE: 0,
  IVA: 0.19,
  IABA10: 0.10,
  IABA18: 0.18,
  ILA_VINO_20_5: 0.205,
  ILA_CERVEZA_20_5: 0.205,
  ILA_DESTILADOS_31_5: 0.315,
};

interface ImportSummaryPanelProps {
  lines: ComputedLine[];
  ivaAmount: number;
  registerExpenses: boolean;
  onRegisterExpensesChange: (checked: boolean) => void;
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: () => void;
  lastSaved?: Date | null;
  isSaving?: boolean;
}

export function ImportSummaryPanel({
  lines,
  ivaAmount,
  registerExpenses,
  onRegisterExpensesChange,
  canConfirm,
  confirming,
  onConfirm,
  lastSaved,
  isSaving,
}: ImportSummaryPanelProps) {
  // Calculate summaries
  const inventoryLines = lines.filter(l => l.status === "OK" && l.matched_product_id);
  const expenseLines = lines.filter(l => l.status === "EXPENSE");
  
  // Subtotal neto (productos) - sum of net_line_for_cost for inventory
  const subtotalNetoProductos = inventoryLines.reduce((sum, l) => sum + l.net_line_for_cost, 0);
  
  // Calculate specific tax amounts per line
  const specificTaxTotal = inventoryLines.reduce((sum, line) => {
    const rate = TAX_RATES[line.tax_category] || 0;
    // Tax is calculated ON the net line (informative)
    const taxAmount = Math.round(line.net_line_for_cost * rate);
    return sum + taxAmount;
  }, 0);
  
  // Gastos operacionales (flete + otros)
  const gastosOperacionales = expenseLines.reduce((sum, l) => sum + l.gross_line, 0);
  
  // Total factura
  const totalFactura = subtotalNetoProductos + specificTaxTotal + ivaAmount + gastosOperacionales;
  
  // Breakdown of specific taxes
  const taxBreakdown = {
    iaba10: inventoryLines.filter(l => l.tax_category === "IABA10").reduce((sum, l) => sum + Math.round(l.net_line_for_cost * 0.10), 0),
    iaba18: inventoryLines.filter(l => l.tax_category === "IABA18").reduce((sum, l) => sum + Math.round(l.net_line_for_cost * 0.18), 0),
    ilaVino: inventoryLines.filter(l => l.tax_category === "ILA_VINO_20_5").reduce((sum, l) => sum + Math.round(l.net_line_for_cost * 0.205), 0),
    ilaCerveza: inventoryLines.filter(l => l.tax_category === "ILA_CERVEZA_20_5").reduce((sum, l) => sum + Math.round(l.net_line_for_cost * 0.205), 0),
    ilaDestilados: inventoryLines.filter(l => l.tax_category === "ILA_DESTILADOS_31_5").reduce((sum, l) => sum + Math.round(l.net_line_for_cost * 0.315), 0),
  };
  
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Resumen Factura</span>
          {/* Auto-save indicator */}
          {isSaving !== undefined && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Guardando...
                </>
              ) : lastSaved ? (
                <>
                  <Clock className="h-3 w-3" />
                  Guardado
                </>
              ) : null}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 5-line breakdown */}
        <div className="space-y-2 text-sm">
          {/* 1. Subtotal neto (productos) */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal neto (productos)</span>
            <span className="font-medium">{formatCLP(subtotalNetoProductos)}</span>
          </div>
          
          {/* 2. Impuestos específicos (IABA/ILA) */}
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              Impuestos específicos
              {specificTaxTotal > 0 && (
                <span className="text-xs text-blue-600">(info)</span>
              )}
            </span>
            <span className={cn("font-medium", specificTaxTotal > 0 ? "text-blue-700" : "")}>
              {formatCLP(specificTaxTotal)}
            </span>
          </div>
          
          {/* Tax breakdown (collapsible if there are taxes) */}
          {specificTaxTotal > 0 && (
            <div className="ml-4 space-y-1 text-xs text-muted-foreground border-l-2 border-blue-200 pl-2">
              {taxBreakdown.iaba10 > 0 && (
                <div className="flex justify-between">
                  <span>IABA 10%</span>
                  <span>{formatCLP(taxBreakdown.iaba10)}</span>
                </div>
              )}
              {taxBreakdown.iaba18 > 0 && (
                <div className="flex justify-between">
                  <span>IABA 18%</span>
                  <span>{formatCLP(taxBreakdown.iaba18)}</span>
                </div>
              )}
              {taxBreakdown.ilaVino > 0 && (
                <div className="flex justify-between">
                  <span>ILA Vino 20,5%</span>
                  <span>{formatCLP(taxBreakdown.ilaVino)}</span>
                </div>
              )}
              {taxBreakdown.ilaCerveza > 0 && (
                <div className="flex justify-between">
                  <span>ILA Cerveza 20,5%</span>
                  <span>{formatCLP(taxBreakdown.ilaCerveza)}</span>
                </div>
              )}
              {taxBreakdown.ilaDestilados > 0 && (
                <div className="flex justify-between">
                  <span>ILA Destilados 31,5%</span>
                  <span>{formatCLP(taxBreakdown.ilaDestilados)}</span>
                </div>
              )}
            </div>
          )}
          
          {/* 3. IVA (informativo) */}
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              IVA 19%
              <span className="text-xs text-purple-600">(doc)</span>
            </span>
            <span className="font-medium text-purple-700">{formatCLP(ivaAmount)}</span>
          </div>
          
          {/* 4. Gastos operacionales */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Gastos operacionales ({expenseLines.length})
            </span>
            <span className={cn("font-medium", gastosOperacionales > 0 ? "text-amber-700" : "")}>
              {formatCLP(gastosOperacionales)}
            </span>
          </div>
          
          <Separator className="my-2" />
          
          {/* 5. TOTAL */}
          <div className="flex justify-between text-base font-semibold">
            <span>TOTAL FACTURA</span>
            <span>{formatCLP(totalFactura)}</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Inventory summary */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Productos a inventario:</span>
          <span className="text-right font-medium">{inventoryLines.length}</span>
          <span className="text-muted-foreground">Unidades totales:</span>
          <span className="text-right font-medium">
            {inventoryLines.reduce((s, l) => s + l.real_units, 0)}
          </span>
          <span className="text-muted-foreground">Monto inventario (CPP):</span>
          <span className="text-right font-medium text-green-700">
            {formatCLP(subtotalNetoProductos)}
          </span>
        </div>
        
        {/* Register expenses toggle */}
        {expenseLines.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="register-expenses" className="text-sm flex items-center gap-2">
                Registrar gastos
                <span className="text-xs text-muted-foreground">
                  ({expenseLines.length} ítem{expenseLines.length > 1 ? "s" : ""})
                </span>
              </Label>
              <Switch
                id="register-expenses"
                checked={registerExpenses}
                onCheckedChange={onRegisterExpensesChange}
              />
            </div>
            {registerExpenses && (
              <div className="text-sm text-amber-700 bg-amber-50 p-2 rounded">
                <div className="font-medium">Se registrará como gasto:</div>
                <ul className="text-xs mt-1 space-y-1">
                  {expenseLines.map((l) => (
                    <li key={l.id}>• {l.raw_product_name}: {formatCLP(l.gross_line)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        
        {/* Tax expense info */}
        {specificTaxTotal > 0 && (
          <div className="text-xs bg-blue-50 text-blue-800 p-2 rounded">
            <strong>Nota:</strong> Los impuestos específicos ({formatCLP(specificTaxTotal)}) 
            se registrarán como gasto fiscal (TAX_EXPENSE) y NO afectarán el costo 
            de inventario (CPP).
          </div>
        )}
        
        {/* Confirm button */}
        <Button
          className="w-full"
          onClick={onConfirm}
          disabled={!canConfirm || confirming}
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Confirmar Ingreso
        </Button>
      </CardContent>
    </Card>
  );
}
