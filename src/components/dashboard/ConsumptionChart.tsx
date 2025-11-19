import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartData {
  date: string;
  entradas: number;
  salidas: number;
}

export const ConsumptionChart = () => {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, []);

  const fetchChartData = async () => {
    try {
      const { data: movements, error } = await supabase
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(30);

      if (error) throw error;

      const groupedData = movements?.reduce((acc: any, movement) => {
        const date = new Date(movement.created_at).toLocaleDateString("es-ES", {
          month: "short",
          day: "numeric",
        });

        if (!acc[date]) {
          acc[date] = { date, entradas: 0, salidas: 0 };
        }

        if (movement.movement_type === "entrada" || movement.movement_type === "compra") {
          acc[date].entradas += movement.quantity;
        } else if (movement.movement_type === "salida") {
          acc[date].salidas += movement.quantity;
        }

        return acc;
      }, {});

      setData(Object.values(groupedData || {}));
    } catch (error) {
      console.error("Error fetching chart data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Consumo y Reposición</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <CardTitle className="text-2xl bg-gradient-to-r from-secondary to-secondary-glow bg-clip-text text-transparent">
          Consumo y Reposición
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--foreground))" />
            <YAxis stroke="hsl(var(--foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="entradas"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              name="Entradas"
              dot={{ fill: "hsl(var(--primary))", r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="salidas"
              stroke="hsl(var(--destructive))"
              strokeWidth={3}
              name="Salidas"
              dot={{ fill: "hsl(var(--destructive))", r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
