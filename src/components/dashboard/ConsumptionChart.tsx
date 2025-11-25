import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";

interface ChartData {
  date: string;
  entradas: number;
  salidas: number;
}

export const ConsumptionChart = () => {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return {
      from: thirtyDaysAgo,
      to: new Date(),
    };
  });

  useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      fetchChartData();
    }
  }, [dateRange]);

  const fetchChartData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;

    try {
      const startDate = new Date(dateRange.from);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(dateRange.to);
      endDate.setHours(23, 59, 59, 999);

      const { data: movements, error } = await supabase
        .from("stock_movements")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: true });

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

  const resetToLast30Days = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    setDateRange({
      from: thirtyDaysAgo,
      to: new Date(),
    });
  };

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-2xl bg-gradient-to-r from-secondary to-secondary-glow bg-clip-text text-transparent">
            Consumo y Reposición
          </CardTitle>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={resetToLast30Days}
              className="whitespace-nowrap"
            >
              Últimos 30 días
            </Button>
          </div>
        </div>
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
