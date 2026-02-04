import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/currency";
import type { ComputedLine } from "@/lib/purchase-calculator";

interface LineDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: ComputedLine | null;
}

export function LineDetailDrawer({ open, onOpenChange, line }: LineDetailDrawerProps) {
  if (!line) return null;

  const statusColors = {
    OK: "bg-green-100 text-green-800 border-green-300",
    REVIEW_REQUIRED: "bg-red-100 text-red-800 border-red-300",
    EXPENSE: "bg-amber-100 text-amber-800 border-amber-300",
    IGNORED: "bg-gray-100 text-gray-600 border-gray-300",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left pr-8">Detalle de Línea</SheetTitle>
          <SheetDescription className="text-left">
            Fórmula de cálculo y fuentes de datos
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Producto */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Producto en Factura</h4>
            <p className="font-medium">{line.raw_product_name}</p>
          </div>

          {/* Estado */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusColors[line.status]}>
              {line.status}
            </Badge>
            {line.matched_product_name && (
              <span className="text-sm text-muted-foreground">
                → {line.matched_product_name}
              </span>
            )}
          </div>

          <Separator />

          {/* Fórmula de Cálculo */}
          <div className="space-y-4">
            <h4 className="font-medium">Fórmula de Cálculo</h4>
            
            {/* Paso 1: Unidades Reales */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">1. Unidades Reales</div>
              <div className="font-mono text-sm">
                {line.qty_invoice} × {line.pack_multiplier} = <span className="font-bold text-primary">{line.real_units}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Cant. Factura × Multiplicador Empaque = Unidades Reales
              </div>
            </div>

            {/* Paso 2: Neto de Línea */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">2. Neto para Costo</div>
              <div className="font-mono text-sm">
                {formatCLP(line.gross_line)} - {formatCLP(line.discount_amount)} - {formatCLP(line.taxes_excluded_for_cost)} = <span className="font-bold text-primary">{formatCLP(line.net_line_for_cost)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Bruto - Descuento - Impuestos = Neto
              </div>
            </div>

            {/* Paso 3: Costo Unitario */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">3. Costo Unitario Neto</div>
              <div className="font-mono text-sm">
                {formatCLP(line.net_line_for_cost)} / {line.real_units} = <span className="font-bold text-green-700">{formatCLP(line.net_unit_cost)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Neto Línea / Unidades Reales = Costo por Unidad
              </div>
            </div>
          </div>

          <Separator />

          {/* Desglose de Impuestos */}
          {line.taxes_excluded_for_cost > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-muted-foreground">Impuestos Excluidos del Costo</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {line.tax_details.iaba_10 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IABA 10%</span>
                    <span>{formatCLP(line.tax_details.iaba_10)}</span>
                  </div>
                )}
                {line.tax_details.iaba_18 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IABA 18%</span>
                    <span>{formatCLP(line.tax_details.iaba_18)}</span>
                  </div>
                )}
                {line.tax_details.ila_vin && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ILA Vino 20.5%</span>
                    <span>{formatCLP(line.tax_details.ila_vin)}</span>
                  </div>
                )}
                {line.tax_details.ila_cer && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ILA Cerveza 20.5%</span>
                    <span>{formatCLP(line.tax_details.ila_cer)}</span>
                  </div>
                )}
                {line.tax_details.ila_lic && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ILA Licor 31.5%</span>
                    <span>{formatCLP(line.tax_details.ila_lic)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Razones / Advertencias */}
          {line.reasons.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-amber-700">Notas del Motor</h4>
              <ul className="text-sm space-y-1">
                {line.reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500">•</span>
                    <span className="text-muted-foreground">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
