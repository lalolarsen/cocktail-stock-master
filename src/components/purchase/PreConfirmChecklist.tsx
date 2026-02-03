import { Check, X, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  critical: boolean;
  details?: string;
}

interface PreConfirmChecklistProps {
  items: ChecklistItem[];
  className?: string;
}

export function PreConfirmChecklist({ items, className }: PreConfirmChecklistProps) {
  const allPassed = items.every((item) => item.passed);
  const criticalFailed = items.some((item) => item.critical && !item.passed);

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
            Checklist Pre-Confirmación
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

// Helper to build checklist items
export function buildPurchaseChecklist(params: {
  hasVenueId: boolean;
  isAdmin: boolean;
  allInventoryItemsMatched: boolean;
  unmatchedCount: number;
  totalCoherenceValid: boolean;
  totalDifference: number;
  noDuplicateFolio: boolean;
  duplicateProvider?: string;
}): ChecklistItem[] {
  return [
    {
      id: "venue",
      label: "Venue asignado correctamente",
      passed: params.hasVenueId,
      critical: true,
    },
    {
      id: "role",
      label: "Usuario con privilegios de administrador",
      passed: params.isAdmin,
      critical: true,
    },
    {
      id: "matched",
      label: "Todos los ítems de inventario tienen producto asignado",
      passed: params.allInventoryItemsMatched,
      critical: true,
      details: params.unmatchedCount > 0 
        ? `${params.unmatchedCount} ítem(s) sin producto asignado` 
        : undefined,
    },
    {
      id: "coherence",
      label: "Sumatoria de líneas coincide con total (tolerancia < $1)",
      passed: params.totalCoherenceValid,
      critical: false,
      details: !params.totalCoherenceValid 
        ? `Diferencia: $${Math.abs(params.totalDifference).toFixed(0)}` 
        : undefined,
    },
    {
      id: "duplicate",
      label: "No existen folios duplicados para este proveedor",
      passed: params.noDuplicateFolio,
      critical: false,
      details: !params.noDuplicateFolio 
        ? `Ya existe documento de ${params.duplicateProvider}` 
        : undefined,
    },
  ];
}
