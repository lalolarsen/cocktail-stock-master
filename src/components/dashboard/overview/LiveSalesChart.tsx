import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { Monitor, RefreshCw } from "lucide-react";
import { formatCLP } from "@/lib/currency";

interface SalesByPOS {
  posId: string;
  posName: string;
  total: number;
  transactions: number;
  type: 'alcohol' | 'tickets';
}

export function LiveSalesChart() {
  const [loading, setLoading] = useState(true);
  const [salesByPOS, setSalesByPOS] = useState<SalesByPOS[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetchSalesByPOS();
    const interval = setInterval(fetchSalesByPOS, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchSalesByPOS = async () => {
    try {
      // Get active jornada
      const { data: jornada } = await supabase
        .from("jornadas")
        .select("id")
        .eq("estado", "activa")
        .maybeSingle();

      if (!jornada) {
        setSalesByPOS([]);
        setLoading(false);
        return;
      }

      // Get all POS terminals
      const { data: posTerminals } = await supabase
        .from("pos_terminals")
        .select("id, name, pos_type")
        .eq("is_active", true);

      // Get alcohol sales by POS
      const { data: alcoholSales } = await supabase
        .from("sales")
        .select("pos_id, total_amount")
        .eq("jornada_id", jornada.id)
        .eq("payment_status", "paid")
        .eq("is_cancelled", false);

      // Get ticket sales by POS
      const { data: ticketSales } = await supabase
        .from("ticket_sales")
        .select("pos_id, total")
        .eq("jornada_id", jornada.id)
        .eq("payment_status", "paid");

      // Aggregate by POS
      const posMap = new Map<string, SalesByPOS>();

      posTerminals?.forEach(pos => {
        posMap.set(pos.id, {
          posId: pos.id,
          posName: pos.name,
          total: 0,
          transactions: 0,
          type: pos.pos_type === 'ticket_sales' ? 'tickets' : 'alcohol'
        });
      });

      alcoholSales?.forEach(sale => {
        if (sale.pos_id && posMap.has(sale.pos_id)) {
          const pos = posMap.get(sale.pos_id)!;
          pos.total += Number(sale.total_amount);
          pos.transactions += 1;
        }
      });

      ticketSales?.forEach(sale => {
        if (sale.pos_id && posMap.has(sale.pos_id)) {
          const pos = posMap.get(sale.pos_id)!;
          pos.total += sale.total;
          pos.transactions += 1;
        }
      });

      const result = Array.from(posMap.values())
        .filter(p => p.transactions > 0)
        .sort((a, b) => b.total - a.total);

      setSalesByPOS(result);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching sales by POS:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = salesByPOS.reduce((sum, p) => sum + p.total, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            Ventas por POS
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
            <Monitor className="h-4 w-4 text-primary" />
            Ventas en vivo por POS
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <p className="text-2xl font-bold text-primary">{formatCLP(totalSales)}</p>
      </CardHeader>
      <CardContent>
        {salesByPOS.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin ventas en esta jornada</p>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByPOS} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="posName" 
                  width={80}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  formatter={(value: number) => formatCLP(value)}
                  labelFormatter={(label) => label}
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem'
                  }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {salesByPOS.map((entry, index) => (
                    <Cell 
                      key={entry.posId}
                      fill={entry.type === 'alcohol' ? 'hsl(160, 45%, 40%)' : 'hsl(220, 60%, 50%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {salesByPOS.length > 0 && (
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
              <span>Alcohol</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(220, 60%, 50%)' }} />
              <span>Tickets</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
