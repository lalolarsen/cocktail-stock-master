import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Package, AlertTriangle, TrendingDown, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  totalProducts: number;
  lowStockProducts: number;
  totalValue: number;
  criticalAlerts: number;
}

export const StatsCards = () => {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    lowStockProducts: 0,
    totalValue: 0,
    criticalAlerts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Get all products
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*");

      if (productsError) throw productsError;

      // Get unread alerts
      const { data: alerts, error: alertsError } = await supabase
        .from("stock_alerts")
        .select("*")
        .eq("is_read", false);

      if (alertsError) throw alertsError;

      const totalProducts = products?.length || 0;
      const lowStockProducts =
        products?.filter((p) => p.current_stock <= p.minimum_stock).length || 0;
      const totalValue =
        products?.reduce(
          (sum, p) => sum + (p.current_stock * (p.cost_per_unit || 0)),
          0
        ) || 0;

      setStats({
        totalProducts,
        lowStockProducts,
        totalValue,
        criticalAlerts: alerts?.length || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Productos",
      value: stats.totalProducts,
      icon: Package,
      gradient: "primary-gradient",
      iconColor: "text-primary-foreground",
    },
    {
      title: "Stock Bajo",
      value: stats.lowStockProducts,
      icon: TrendingDown,
      gradient: "alert-gradient",
      iconColor: "text-white",
    },
    {
      title: "Alertas Activas",
      value: stats.criticalAlerts,
      icon: AlertTriangle,
      gradient: "alert-gradient",
      iconColor: "text-white",
      pulse: stats.criticalAlerts > 0,
    },
    {
      title: "Valor Inventario",
      value: `$${stats.totalValue.toFixed(2)}`,
      icon: DollarSign,
      gradient: "secondary-gradient",
      iconColor: "text-secondary-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <Card
          key={index}
          className={`${card.gradient} border-0 hover-lift ${
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
              </div>
              <card.icon className={`h-12 w-12 ${card.iconColor} opacity-80`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
