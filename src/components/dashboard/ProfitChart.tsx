import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign } from "lucide-react";
import { formatCLP } from "@/lib/currency";

interface ProfitData {
  date: string;
  ingresos: number;
  costos: number;
  ganancias: number;
}

export const ProfitChart = () => {
  const [data, setData] = useState<ProfitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalProfit, setTotalProfit] = useState(0);

  useEffect(() => {
    fetchProfitData();
  }, []);

  const fetchProfitData = async () => {
    try {
      // Obtener ventas de los últimos 30 días
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select(`
          id,
          total_amount,
          created_at,
          is_cancelled,
          sale_items!inner (
            id,
            quantity,
            cocktail_id,
            cocktails!inner (
              id,
              name,
              cocktail_ingredients!inner (
                quantity,
                products!inner (
                  cost_per_unit
                )
              )
            )
          )
        `)
        .eq("is_cancelled", false)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      console.log("Sales query result:", { sales, salesError });

      if (salesError) {
        console.error("Error en consulta de ventas:", salesError);
        throw salesError;
      }

      // Agrupar por fecha y calcular ganancias
      const profitByDate = new Map<string, { ingresos: number; costos: number }>();

      sales?.forEach((sale: any) => {
        const date = new Date(sale.created_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        });

        // Calcular costos de esta venta
        let saleCost = 0;
        sale.sale_items?.forEach((item: any) => {
          item.cocktails?.cocktail_ingredients?.forEach((ingredient: any) => {
            const ingredientCost = (ingredient.quantity * (ingredient.products?.cost_per_unit || 0)) * item.quantity;
            saleCost += ingredientCost;
          });
        });

        const existing = profitByDate.get(date) || { ingresos: 0, costos: 0 };
        profitByDate.set(date, {
          ingresos: existing.ingresos + (sale.total_amount || 0),
          costos: existing.costos + saleCost,
        });
      });

      // Convertir a array para el gráfico
      const chartData: ProfitData[] = Array.from(profitByDate.entries()).map(([date, values]) => ({
        date,
        ingresos: values.ingresos,
        costos: values.costos,
        ganancias: values.ingresos - values.costos,
      }));

      console.log("Chart data:", chartData);

      setData(chartData);
      
      // Calcular ganancia total
      const total = chartData.reduce((sum, item) => sum + item.ganancias, 0);
      setTotalProfit(total);
    } catch (error) {
      console.error("Error completo al obtener datos de ganancias:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Gráfico de Ganancias</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="text-xl">Ganancias (Últimos 30 días)</span>
          </CardTitle>
          <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold text-primary">
              {formatCLP(totalProfit)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No hay datos de ventas disponibles</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--foreground))' }}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => formatCLP(value)}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="ingresos" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                name="Ingresos"
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              <Line 
                type="monotone" 
                dataKey="costos" 
                stroke="hsl(var(--destructive))" 
                strokeWidth={2}
                name="Costos"
                dot={{ fill: 'hsl(var(--destructive))' }}
              />
              <Line 
                type="monotone" 
                dataKey="ganancias" 
                stroke="hsl(160 84% 39%)" 
                strokeWidth={3}
                name="Ganancias"
                dot={{ fill: 'hsl(160 84% 39%)', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
