import { Card, CardContent } from "@/components/ui/card";
import { Package, AlertTriangle, TrendingDown, DollarSign, Warehouse, Wine } from "lucide-react";
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  // Correct valuation: for bottles, stock is in ml and cost_per_unit is per full bottle
  // → use cost_per_ml = cost_per_unit / capacity_ml
  const calcValue = (stock: number, p: typeof products[number]) => {
    const cap = p.capacity_ml;
    const costPerBase = isBottle(p) && cap && cap > 0 ? p.cost_per_unit / cap : p.cost_per_unit;
    return stock * costPerBase;
  };
  const warehouseTotal = products.reduce((sum, p) => sum + calcValue(p.warehouseStock, p), 0);
  const barTotal = products.reduce((sum, p) => sum + calcValue(p.barStock, p), 0);

  const cards = [
    {
      title: "Total Productos",
      value: stats.totalProducts,
      icon: Package,
      gradient: "primary-gradient",
      iconColor: "text-primary-foreground",
      tooltip: "Cantidad de productos registrados en el sistema",
    },
    {
      title: "Stock Bodega Bajo",
      value: stats.lowStockProducts,
      subtitle: "bajo mínimo",
      icon: Warehouse,
      gradient: "alert-gradient",
      iconColor: "text-white",
      tooltip: "Productos con stock en bodega igual o menor al mínimo (para planificar reposición)",
    },
    {
      title: "Alertas Activas",
      value: stats.criticalAlerts,
      icon: AlertTriangle,
      gradient: "alert-gradient",
      iconColor: "text-white",
      pulse: stats.criticalAlerts > 0,
      tooltip: "Alertas no leídas de stock bajo o crítico",
    },
    {
      title: "Valor Inventario Total",
      value: formatCLP(stats.totalValue),
      subtitle: `Bodega: ${formatCLP(warehouseTotal)} | Barras: ${formatCLP(barTotal)}`,
      icon: DollarSign,
      gradient: "secondary-gradient",
      iconColor: "text-secondary-foreground",
      tooltip: "Valor total del inventario en bodega + barras",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <Card
                className={`${card.gradient} border-0 hover-lift cursor-help ${
                  card.pulse ? "pulse-glow" : ""
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium opacity-90 text-white">
                        {card.title}
                      </p>
                      <p className="text-3xl font-bold mt-2 text-white">
                        {card.value}
                      </p>
                      {card.subtitle && (
                        <p className="text-xs opacity-75 mt-1 text-white">
                          {card.subtitle}
                        </p>
                      )}
                    </div>
                    <card.icon className={`h-12 w-12 ${card.iconColor} opacity-80`} />
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
