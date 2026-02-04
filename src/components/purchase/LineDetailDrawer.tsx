import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ComputedLine } from "@/lib/purchase-calculator";
import { getTaxCategoryLabel } from "@/lib/purchase-calculator";

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
            Fórmula de cálculo completa
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Producto */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Producto en Factura</h4>
            <p className="font-medium">{line.raw_product_name}</p>
            {line.pack_reason && (
              <p className="text-xs text-muted-foreground mt-1">
                Patrón detectado: <code className="bg-muted px-1 rounded">{line.pack_reason}</code>
              </p>
            )}
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

          {/* Fórmula de Cálculo - NUEVA */}
          <div className="space-y-4">
            <h4 className="font-medium">Fórmula de Cálculo</h4>
            
            {/* Paso 1: Unidades Reales */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">1. Unidades Reales</div>
              <div className="font-mono text-sm">
                {line.qty_invoice} × {line.pack_multiplier} = <span className="font-bold text-primary">{line.real_units}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Cant. Factura × Multiplicador = Unidades Reales
              </div>
            </div>

            {/* Paso 2: Precio Unitario Real */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">2. Precio Unitario Real</div>
              {line.pack_priced ? (
                <>
                  <div className="font-mono text-sm">
                    {formatCLP(line.invoice_unit_price_raw)} ÷ {line.pack_multiplier} = <span className="font-bold text-primary">{formatCLP(line.unit_price_real)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Precio Factura ÷ Multiplicador = Precio Unit. Real
                  </div>
                  <Badge variant="outline" className="mt-1 text-xs bg-blue-50 text-blue-700">
                    Precio viene por PACK
                  </Badge>
                </>
              ) : (
                <>
                  <div className="font-mono text-sm">
                    {formatCLP(line.invoice_unit_price_raw)} = <span className="font-bold text-primary">{formatCLP(line.unit_price_real)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Precio Factura = Precio Unit. Real (por unidad)
                  </div>
                </>
              )}
            </div>

            {/* Paso 3: Descuento */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">3. Precio Neto Unitario (con descuento)</div>
              <div className="font-mono text-sm">
                {formatCLP(line.unit_price_real)} × (1 - {line.discount_pct}%) = <span className="font-bold text-green-700">{formatCLP(line.unit_price_after_discount)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Precio Real × (1 - Descuento%) = Precio Neto Unit.
              </div>
              {line.discount_pct > 0 && (
                <div className="text-xs text-amber-600 mt-1">
                  Ahorro por descuento: {formatCLP(line.unit_price_real - line.unit_price_after_discount)} por unidad
                </div>
              )}
            </div>

            {/* Paso 4: Total Línea */}
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <div className="text-sm font-medium text-muted-foreground">4. Total Línea para Costo</div>
              <div className="font-mono text-sm">
                {formatCLP(line.unit_price_after_discount)} × {line.real_units} = <span className="font-bold text-primary">{formatCLP(line.net_line_for_cost)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Precio Neto Unit. × Unidades Reales = Total Línea
              </div>
            </div>

            {/* Resultado Final */}
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
              <div className="text-sm font-medium text-green-800 mb-2">Resultado: Costo para CPP</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-green-700">Costo Neto Unitario:</span>
                <span className="font-bold text-green-800 text-right">{formatCLP(line.net_unit_cost)}</span>
                <span className="text-green-700">Unidades Reales:</span>
                <span className="font-bold text-green-800 text-right">{line.real_units}</span>
                <span className="text-green-700">Total Neto Línea:</span>
                <span className="font-bold text-green-800 text-right">{formatCLP(line.net_line_for_cost)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Impuestos Informativos */}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground">Impuesto Clasificado (Informativo)</h4>
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={cn("text-sm", {
                  "bg-gray-100 text-gray-600": line.tax_category === 'NONE',
                  "bg-blue-100 text-blue-700": line.tax_category === 'IABA10' || line.tax_category === 'IABA18',
                  "bg-purple-100 text-purple-700": line.tax_category === 'ILA_VINO_20_5',
                  "bg-amber-100 text-amber-700": line.tax_category === 'ILA_CERVEZA_20_5',
                  "bg-red-100 text-red-700": line.tax_category === 'ILA_DESTILADOS_31_5',
                })}
              >
                {getTaxCategoryLabel(line.tax_category)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Este impuesto es solo informativo y NO afecta el cálculo del costo ni el CPP.
            </p>
          </div>

          {/* Desglose de Impuestos Extraídos */}
          {line.taxes_excluded_for_cost > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-muted-foreground">Impuestos Extraídos de Factura</h4>
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
              <p className="text-xs text-muted-foreground mt-1">
                Total impuestos extraídos: {formatCLP(line.taxes_excluded_for_cost)}
              </p>
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
