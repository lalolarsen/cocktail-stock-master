import { Card, CardContent } from "@/components/ui/card";
import { Package, AlertTriangle, DollarSign, Warehouse } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStockData } from "@/hooks/useStockData";
import { formatCLP } from "@/lib/currency";
import { isBottle } from "@/lib/product-type";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const StatsCards = () => {
  const { stats, products, loading } = useStockData();

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const calcValue = (stock: number, p: typeof products[number]) => {
    const cap = p.capacity_ml;
    const costPerBase = isBottle(p) && cap && cap > 0 ? p.cost_per_unit / cap : p.cost_per_unit;
    return Math.round(stock * costPerBase);
  };
  const warehouseTotal = products.reduce((sum, p) => sum + calcValue(p.warehouseStock, p), 0);
  const barTotal = products.reduce((sum, p) => sum + calcValue(p.barStock, p), 0);

  const cards = [
    {
      title: "Productos",
      value: stats.totalProducts,
      icon: Package,
      tooltip: "Productos registrados en el sistema",
    },
    {
      title: "Stock bajo",
      value: stats.lowStockProducts,
      sub: "bajo mínimo",
      icon: Warehouse,
      alert: stats.lowStockProducts > 0,
      tooltip: "Productos con stock en bodega bajo el mínimo",
    },
    {
      title: "Alertas",
      value: stats.criticalAlerts,
      icon: AlertTriangle,
      alert: stats.criticalAlerts > 0,
      tooltip: "Alertas no leídas de stock bajo o crítico",
    },
    {
      title: "Valor inventario",
      value: formatCLP(stats.totalValue),
      sub: `Bod ${formatCLP(warehouseTotal)} · Bar ${formatCLP(barTotal)}`,
      icon: DollarSign,
      tooltip: "Valor total del inventario (bodega + barras)",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {cards.map((card, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <Card className="cursor-help border-border hover:border-muted-foreground/20 transition-colors">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                        {card.title}
                      </p>
                      <p className={`text-lg sm:text-xl font-bold tabular-nums leading-tight ${
                        card.alert ? "text-amber-400" : "text-foreground"
                      }`}>
                        {card.value}
                      </p>
                      {card.sub && (
                        <p className="text-[10px] text-muted-foreground leading-tight truncate">
                          {card.sub}
                        </p>
                      )}
                    </div>
                    <card.icon className={`w-4 h-4 shrink-0 mt-0.5 ${
                      card.alert ? "text-amber-400/60" : "text-muted-foreground/20"
                    }`} />
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>{card.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};
