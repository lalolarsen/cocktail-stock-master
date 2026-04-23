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

      const [{ data: sales }, { data: tickets }] = await Promise.all([
        supabase
          .from("sales")
          .select("id")
          .eq("jornada_id", jornada.id)
          .eq("payment_status", "paid")
          .eq("is_cancelled", false),
        supabase
          .from("ticket_sales")
          .select("id")
          .eq("jornada_id", jornada.id)
          .eq("payment_status", "paid"),
      ]);

      const productMap = new Map<string, TopProduct>();

      if (sales?.length) {
        const saleIds = sales.map(s => s.id);
        const { data: saleItems } = await supabase
          .from("sale_items")
          .select(`quantity, subtotal, cocktail:cocktails(id, name)`)
          .in("sale_id", saleIds);

        saleItems?.forEach(item => {
          if (!item.cocktail) return;
          const c = item.cocktail as { id: string; name: string };
          const existing = productMap.get(c.id);
          if (existing) {
            existing.quantity += item.quantity;
            existing.revenue += Number(item.subtotal);
          } else {
            productMap.set(c.id, { id: c.id, name: c.name, quantity: item.quantity, revenue: Number(item.subtotal) });
          }
        });
      }

      if (tickets?.length) {
        const ticketIds = tickets.map(t => t.id);
        const { data: ticketItems } = await supabase
          .from("ticket_sale_items")
          .select(`quantity, line_total, ticket_type_id, ticket_types(name)`)
          .in("ticket_sale_id", ticketIds);

        ticketItems?.forEach((item: any) => {
          const tt = item.ticket_types;
          if (!tt) return;
          const key = `ticket:${item.ticket_type_id}`;
          const existing = productMap.get(key);
          if (existing) {
            existing.quantity += Number(item.quantity);
            existing.revenue += Number(item.line_total);
          } else {
            productMap.set(key, {
              id: key,
              name: `🎫 ${tt.name}`,
              quantity: Number(item.quantity),
              revenue: Number(item.line_total),
            });
          }
        });
      }

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
