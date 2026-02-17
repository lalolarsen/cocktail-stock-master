import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";
import type { TransferHistoryRow } from "./types";

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

  return (
    <div className="space-y-4">
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
                return (
                  <button
                    key={row.id}
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className="w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(row.created_at), "HH:mm")}
                        </span>
                        <span className="text-sm font-medium truncate">{row.product_name}</span>
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
                          <p>Costo unitario: {formatCLP(row.unit_cost)}{row.capacity_ml ? "/botella" : "/ud"}</p>
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
  );
}
