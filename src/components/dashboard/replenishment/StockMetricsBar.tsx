import { Card, CardContent } from "@/components/ui/card";
import { Warehouse, Store, TrendingUp } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { Progress } from "@/components/ui/progress";

interface Props {
  warehouseCost: number;
  barsCost: number;
  warehousePct: number;
  barsPct: number;
}

export function StockMetricsBar({ warehouseCost, barsCost, warehousePct, barsPct }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          Stock en Barras vs Bodega
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Bodega</span>
            </div>
            <p className="text-xl font-bold">{formatCLP(warehouseCost)}</p>
            <Progress value={warehousePct} className="h-2" />
            <p className="text-xs text-muted-foreground">{warehousePct.toFixed(1)}% del capital</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">En operación</span>
            </div>
            <p className="text-xl font-bold">{formatCLP(barsCost)}</p>
            <Progress value={barsPct} className="h-2" />
            <p className="text-xs text-muted-foreground">{barsPct.toFixed(1)}% del capital</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
