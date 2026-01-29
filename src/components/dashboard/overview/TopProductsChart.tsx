import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { TrendingUp, RefreshCw } from "lucide-react";
import { formatCLP } from "@/lib/currency";

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export function TopProductsChart() {
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchTopProducts();
    const interval = setInterval(fetchTopProducts, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchTopProducts = async () => {
    try {
      // Get active jornada
      const { data: jornada } = await supabase
        .from("jornadas")
        .select("id")
        .eq("estado", "activa")
        .maybeSingle();

      if (!jornada) {
        setTopProducts([]);
        setLoading(false);
        return;
      }

      // Get sales from this jornada
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("jornada_id", jornada.id)
        .eq("payment_status", "paid")
        .eq("is_cancelled", false);

      if (!sales?.length) {
        setTopProducts([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);

      // Get sale items with cocktail info
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select(`
          quantity,
          subtotal,
          cocktail:cocktails(id, name)
        `)
        .in("sale_id", saleIds);

      // Aggregate by product
      const productMap = new Map<string, TopProduct>();

      saleItems?.forEach(item => {
        if (!item.cocktail) return;
        const cocktail = item.cocktail as { id: string; name: string };
        
        if (productMap.has(cocktail.id)) {
          const existing = productMap.get(cocktail.id)!;
          existing.quantity += item.quantity;
          existing.revenue += Number(item.subtotal);
        } else {
          productMap.set(cocktail.id, {
            id: cocktail.id,
            name: cocktail.name,
            quantity: item.quantity,
            revenue: Number(item.subtotal)
          });
        }
      });

      const sorted = Array.from(productMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8);

      setTopProducts(sorted);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching top products:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalUnits = topProducts.reduce((sum, p) => sum + p.quantity, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Productos más vendidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Productos más vendidos
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <p className="text-2xl font-bold text-primary">{totalUnits} <span className="text-sm font-normal text-muted-foreground">unidades</span></p>
      </CardHeader>
      <CardContent>
        {topProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin ventas en esta jornada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topProducts.map((product, index) => {
              const percentage = (product.quantity / totalUnits) * 100;
              return (
                <div key={product.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">{index + 1}</span>
                      <span className="truncate font-medium">{product.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                      <span className="font-medium text-foreground">{product.quantity}</span>
                      <span className="text-xs">({formatCLP(product.revenue)})</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
