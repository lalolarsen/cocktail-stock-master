/**
 * ImportSummaryPanel - Detailed summary breakdown
 * 
 * Shows 5-line breakdown as required:
 * 1. Subtotal neto (productos) - sum of net lines
 * 2. Impuestos específicos (IABA/ILA) - CAPITALIZED to inventory cost
 * 3. IVA (informativo) - NOT included in inventory
 * 4. Gastos operacionales (flete + otros)
 * 5. TOTAL factura
 * 
 * RULE: ILA/IABA are now CAPITALIZED to inventory cost (not expenses)
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check, Clock, PackagePlus } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import type { ComputedLine, TaxCategory } from "@/lib/purchase-calculator";
import { TAX_RATES } from "@/lib/purchase-calculator";
import { cn } from "@/lib/utils";

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
  
  // 1. Subtotal neto (productos) - sum of net lines (before specific taxes)
  const subtotalNetoProductos = inventoryLines.reduce((sum, l) => sum + l.net_line_for_cost, 0);
  
  // 2. Impuestos específicos CAPITALIZADOS (sum of specific_tax_amount)
  const specificTaxTotal = inventoryLines.reduce((sum, line) => sum + line.specific_tax_amount, 0);
  
  // 3. TOTAL INVENTARIO (Subtotal + Impuestos específicos) = sum of inventory_cost_line
  const totalInventario = inventoryLines.reduce((sum, l) => sum + l.inventory_cost_line, 0);
  
  // 4. Gastos operacionales (flete + otros)
  const gastosOperacionales = expenseLines.reduce((sum, l) => sum + l.gross_line, 0);
  
  // 5. Total factura (inventario + gastos + IVA)
  const totalFactura = totalInventario + gastosOperacionales + ivaAmount;
  
  // Breakdown of specific taxes by type
  const taxBreakdown = {
    iaba10: inventoryLines.filter(l => l.tax_category === "IABA_10").reduce((sum, l) => sum + l.specific_tax_amount, 0),
    iaba18: inventoryLines.filter(l => l.tax_category === "IABA_18").reduce((sum, l) => sum + l.specific_tax_amount, 0),
    ilaVino: inventoryLines.filter(l => l.tax_category === "ILA_VINO_205").reduce((sum, l) => sum + l.specific_tax_amount, 0),
    ilaCerveza: inventoryLines.filter(l => l.tax_category === "ILA_CERVEZA_205").reduce((sum, l) => sum + l.specific_tax_amount, 0),
    ilaDestilados: inventoryLines.filter(l => l.tax_category === "ILA_DESTILADOS_315").reduce((sum, l) => sum + l.specific_tax_amount, 0),
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
          
          {/* 2. Impuestos específicos (IABA/ILA) - CAPITALIZADOS */}
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              Impuestos específicos
              {specificTaxTotal > 0 && (
                <span className="text-xs text-primary font-medium">(+inventario)</span>
              )}
            </span>
            <span className={cn("font-medium", specificTaxTotal > 0 ? "text-primary" : "")}>
              {formatCLP(specificTaxTotal)}
            </span>
          </div>
          
          {/* Tax breakdown (collapsible if there are taxes) */}
          {specificTaxTotal > 0 && (
            <div className="ml-4 space-y-1 text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
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
          
          <Separator className="my-2" />
          
          {/* TOTAL INVENTARIO = Subtotal + Impuestos específicos */}
          <div className="flex justify-between bg-primary/10 p-2 rounded -mx-2">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <PackagePlus className="h-4 w-4 text-primary" />
              TOTAL INVENTARIO
            </span>
            <span className="font-bold text-primary">{formatCLP(totalInventario)}</span>
          </div>
          
          <Separator className="my-2" />
          
          {/* 3. IVA (informativo - no afecta inventario) */}
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              IVA 19%
              <span className="text-xs text-muted-foreground">(doc, no inventario)</span>
            </span>
            <span className="font-medium text-muted-foreground">{formatCLP(ivaAmount)}</span>
          </div>
          
          {/* 4. Gastos operacionales */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Gastos operacionales ({expenseLines.length})
            </span>
            <span className={cn("font-medium", gastosOperacionales > 0 ? "text-warning" : "")}>
              {formatCLP(gastosOperacionales)}
            </span>
          </div>
          
          <Separator className="my-2" />
          
          {/* 5. TOTAL FACTURA */}
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
          <span className="text-muted-foreground">Valor inventario (con imp.):</span>
          <span className="text-right font-bold text-primary">
            {formatCLP(totalInventario)}
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
              <div className="text-sm text-warning bg-warning/10 p-2 rounded">
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
        
        {/* Tax capitalization info */}
        {specificTaxTotal > 0 && (
          <div className="text-xs bg-primary/5 text-foreground p-2 rounded border border-primary/20">
            <strong>✓ Impuestos capitalizados:</strong> Los impuestos específicos ({formatCLP(specificTaxTotal)}) 
            están incluidos en el costo de inventario y afectarán el CPP de cada producto.
          </div>
        )}
        
        {/* IVA info */}
        {ivaAmount > 0 && (
          <div className="text-xs bg-muted text-muted-foreground p-2 rounded border border-border">
            <strong>Nota:</strong> El IVA ({formatCLP(ivaAmount)}) es informativo y NO afecta el costo de inventario.
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
