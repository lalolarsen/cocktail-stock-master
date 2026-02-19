import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TransferHistoryRow } from "./types";

/**
 * Detects potential valuation inconsistency for volumetric products:
 * If unit_cost_snapshot > 500 CLP/ml AND product has capacity_ml,
 * it likely means the snapshot stored bottle cost instead of per-ml cost.
 */
function isInconsistentValuation(row: TransferHistoryRow): boolean {
  if (!row.capacity_ml || row.unit_cost == null) return false;
  return row.unit_cost > 500;
}

interface Props {
  history: TransferHistoryRow[];
}

export function TransferHistory({ history }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No hay transferencias registradas</p>
        </CardContent>
      </Card>
    );
  }

  // Group by date
  const grouped = new Map<string, TransferHistoryRow[]>();
  for (const row of history) {
    const dateKey = format(new Date(row.created_at), "yyyy-MM-dd");
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(row);
  }

  const inconsistentCount = history.filter(isInconsistentValuation).length;

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* Global inconsistency warning */}
      {inconsistentCount > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              {inconsistentCount} movimiento{inconsistentCount !== 1 ? "s" : ""} con valorización posiblemente inconsistente
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Movimientos de productos en ml donde el costo unitario snapshot parece ser el costo por botella en lugar de costo por ml. Revisa los movimientos marcados con ⚠.
            </p>
          </div>
        </div>
      )}

      {Array.from(grouped.entries()).map(([dateKey, rows]) => {
        const totalCost = rows.reduce((s, r) => s + (r.total_cost || 0), 0);
        return (
          <Card key={dateKey}>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">
                  {format(new Date(dateKey), "EEEE dd MMM yyyy", { locale: es })}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{rows.length} mov.</Badge>
                  {totalCost > 0 && (
                    <Badge variant="outline">{formatCLP(totalCost)}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1">
              {rows.map(row => {
                const isExpanded = expandedId === row.id;
                const inconsistent = isInconsistentValuation(row);
                return (
                  <button
                    key={row.id}
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className={`w-full text-left p-2 rounded-lg transition-colors ${
                      inconsistent
                        ? "hover:bg-destructive/10 border border-destructive/20 bg-destructive/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(row.created_at), "HH:mm")}
                        </span>
                        <span className="text-sm font-medium truncate">{row.product_name}</span>
                        {inconsistent && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">Valorización inconsistente: revisar movimiento</p>
                              <p className="text-xs mt-1">
                                El costo unitario ({formatCLP(row.unit_cost!)}/ml) parece ser costo por botella, no por ml.
                                Esto puede afectar el COGS. Los nuevos ingresos ya están corregidos.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm">{row.quantity} {row.product_unit}</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 pl-12 text-xs text-muted-foreground space-y-1">
                        <p>{row.from_location} → {row.to_location}</p>
                        {row.unit_cost != null && (
                          <p>
                            Costo unitario: {formatCLP(row.unit_cost)}
                            {row.capacity_ml ? "/ml" : "/ud"}
                            {inconsistent && (
                              <span className="ml-2 text-destructive font-medium">⚠ Revisar</span>
                            )}
                          </p>
                        )}
                        {row.total_cost != null && <p>Costo total: {formatCLP(row.total_cost)}</p>}
                        {row.notes && <p className="italic">{row.notes}</p>}
                      </div>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
    </TooltipProvider>
  );
}
