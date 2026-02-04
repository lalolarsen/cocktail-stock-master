import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateForConfirmation, type ComputedLine } from "@/lib/purchase-calculator";

interface StabilizedChecklistProps {
  lines: ComputedLine[];
  hasVenueId: boolean;
  isAdmin: boolean;
  className?: string;
}

export function StabilizedChecklist({ lines, hasVenueId, isAdmin, className }: StabilizedChecklistProps) {
  const validation = validateForConfirmation(lines);
  
  // Build checklist items
  const items = [
    {
      id: "venue",
      label: "Venue asignado correctamente",
      passed: hasVenueId,
      critical: true,
    },
    {
      id: "role",
      label: "Usuario con privilegios de administrador",
      passed: isAdmin,
      critical: true,
    },
    {
      id: "no_review",
      label: "No hay líneas que requieran revisión",
      passed: lines.filter(l => l.status === "REVIEW_REQUIRED").length === 0,
      critical: true,
      details: lines.filter(l => l.status === "REVIEW_REQUIRED").length > 0
        ? `${lines.filter(l => l.status === "REVIEW_REQUIRED").length} línea(s) requieren revisión`
        : undefined,
    },
    {
      id: "all_matched",
      label: "Productos de inventario tienen producto asignado",
      passed: lines.filter(l => l.status === "OK" && !l.matched_product_id).length === 0,
      critical: true,
      details: lines.filter(l => l.status === "OK" && !l.matched_product_id).length > 0
        ? `${lines.filter(l => l.status === "OK" && !l.matched_product_id).length} sin producto`
        : undefined,
    },
    {
      id: "valid_units",
      label: "Todas las líneas tienen unidades reales válidas",
      passed: lines.filter(l => l.status === "OK" && l.real_units <= 0).length === 0,
      critical: true,
      details: lines.filter(l => l.status === "OK" && l.real_units <= 0).length > 0
        ? `${lines.filter(l => l.status === "OK" && l.real_units <= 0).length} con unidades inválidas`
        : undefined,
    },
    {
      id: "valid_cost",
      label: "Todas las líneas tienen costo unitario válido",
      passed: lines.filter(l => l.status === "OK" && l.net_unit_cost <= 0).length === 0,
      critical: true,
      details: lines.filter(l => l.status === "OK" && l.net_unit_cost <= 0).length > 0
        ? `${lines.filter(l => l.status === "OK" && l.net_unit_cost <= 0).length} con costo inválido`
        : undefined,
    },
  ];

  const allPassed = items.every(item => item.passed);
  const criticalFailed = items.some(item => item.critical && !item.passed);

  return (
    <Card className={cn("border-2", className, {
      "border-green-500/30 bg-green-50/50": allPassed,
      "border-red-500/30 bg-red-50/50": criticalFailed,
      "border-amber-500/30 bg-amber-50/50": !allPassed && !criticalFailed,
    })}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {allPassed ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : criticalFailed ? (
              <X className="h-4 w-4 text-red-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            Validación Pre-Confirmación
          </span>
          <Badge 
            variant="outline" 
            className={cn({
              "bg-green-100 text-green-700 border-green-300": allPassed,
              "bg-red-100 text-red-700 border-red-300": criticalFailed,
              "bg-amber-100 text-amber-700 border-amber-300": !allPassed && !criticalFailed,
            })}
          >
            {items.filter(i => i.passed).length}/{items.length} OK
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-2 text-sm py-1 px-2 rounded",
              item.passed ? "text-muted-foreground" : item.critical ? "bg-red-100/50" : "bg-amber-100/50"
            )}
          >
            {item.passed ? (
              <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            ) : item.critical ? (
              <X className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <span className={cn({ "font-medium": !item.passed && item.critical })}>
                {item.label}
              </span>
              {item.details && !item.passed && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.details}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
