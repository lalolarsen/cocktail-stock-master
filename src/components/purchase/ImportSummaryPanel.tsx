/**
 * ImportSummaryPanel - Simplified for inventory COGS only
 * Shows: products count, total units, total COGS net
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check, Clock, PackagePlus } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import type { ComputedLine } from "@/lib/purchase-calculator";

interface ImportSummaryPanelProps {
  lines: ComputedLine[];
  canConfirm: boolean;
  confirming: boolean;
  onConfirm: () => void;
  lastSaved?: Date | null;
  isSaving?: boolean;
  // Legacy props — accepted but ignored
  ivaAmount?: number;
  registerExpenses?: boolean;
  onRegisterExpensesChange?: (checked: boolean) => void;
}

export function ImportSummaryPanel({
  lines,
  canConfirm,
  confirming,
  onConfirm,
  lastSaved,
  isSaving,
}: ImportSummaryPanelProps) {
  const inventoryLines = lines.filter(l => l.status === "OK" && l.matched_product_id);
  
  const totalCOGSNet = inventoryLines.reduce((sum, l) => sum + l.net_line_for_cost, 0);
  const totalUnits = inventoryLines.reduce((s, l) => s + l.real_units, 0);

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Resumen de Ingreso</span>
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
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Productos a inventario</span>
            <span className="font-medium">{inventoryLines.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Unidades totales</span>
            <span className="font-medium">{totalUnits}</span>
          </div>
          
          <Separator className="my-2" />
          
          <div className="flex justify-between bg-primary/10 p-2 rounded -mx-2">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <PackagePlus className="h-4 w-4 text-primary" />
              COSTO NETO TOTAL
            </span>
            <span className="font-bold text-primary">{formatCLP(totalCOGSNet)}</span>
          </div>
        </div>

        <Separator />

        {inventoryLines.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground max-h-32 overflow-y-auto">
            {inventoryLines.map((l) => (
              <div key={l.id} className="flex justify-between">
                <span className="truncate mr-2">{l.matched_product_name || l.raw_product_name}</span>
                <span className="tabular-nums shrink-0">{l.real_units} × {formatCLP(l.net_unit_cost)}</span>
              </div>
            ))}
          </div>
        )}

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
