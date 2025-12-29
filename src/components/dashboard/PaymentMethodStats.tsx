import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, CreditCard, Banknote, Smartphone, TrendingUp } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface PaymentStats {
  method: string;
  label: string;
  total: number;
  count: number;
  percentage: number;
  color: string;
  icon: React.ElementType;
}

const PAYMENT_CONFIG = {
  cash: { label: "Efectivo", color: "#22c55e", icon: Banknote },
  debit: { label: "Débito", color: "#3b82f6", icon: CreditCard },
  credit: { label: "Crédito", color: "#8b5cf6", icon: CreditCard },
  transfer: { label: "Transferencia", color: "#f59e0b", icon: Smartphone },
};

export function PaymentMethodStats() {
  const [stats, setStats] = useState<PaymentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    fetchPaymentStats();
  }, []);

  const fetchPaymentStats = async () => {
    try {
      const { data: sales, error } = await supabase
        .from("sales")
        .select("total_amount, payment_method")
        .eq("is_cancelled", false);

      if (error) throw error;

      // Group by payment method
      const grouped: Record<string, { total: number; count: number }> = {};
      let grandTotal = 0;

      (sales || []).forEach((sale: any) => {
        const method = sale.payment_method || "cash";
        if (!grouped[method]) {
          grouped[method] = { total: 0, count: 0 };
        }
        grouped[method].total += Number(sale.total_amount);
        grouped[method].count += 1;
        grandTotal += Number(sale.total_amount);
      });

      // Convert to stats array
      const statsData: PaymentStats[] = Object.entries(PAYMENT_CONFIG).map(
        ([method, config]) => ({
          method,
          label: config.label,
          total: grouped[method]?.total || 0,
          count: grouped[method]?.count || 0,
          percentage:
            grandTotal > 0
              ? ((grouped[method]?.total || 0) / grandTotal) * 100
              : 0,
          color: config.color,
          icon: config.icon,
        })
      );

      setStats(statsData);
      setTotalSales(sales?.length || 0);
      setTotalAmount(grandTotal);
    } catch (error) {
      console.error("Error fetching payment stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  const pieData = stats.filter((s) => s.total > 0);
  const barData = stats.map((s) => ({
    name: s.label,
    ventas: s.count,
    monto: s.total,
    fill: s.color,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.method} className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground truncate">
                    {stat.label}
                  </p>
                  <p className="text-lg font-bold">{formatCLP(stat.total)}</p>
                  <p className="text-xs text-muted-foreground">
                    {stat.count} ventas
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Distribución por Método de Pago</h3>
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="total"
                  nameKey="label"
                  label={({ label, percentage }) =>
                    `${label}: ${percentage.toFixed(1)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCLP(value)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No hay datos de ventas
            </div>
          )}
        </Card>

        {/* Bar Chart */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Cantidad de Ventas por Método</h3>
          </div>
          {totalSales > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number, name: string) => [
                    name === "monto" ? formatCLP(value) : value,
                    name === "monto" ? "Monto" : "Ventas",
                  ]}
                />
                <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No hay datos de ventas
            </div>
          )}
        </Card>
      </div>

      {/* Total Summary */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total General</p>
            <p className="text-2xl font-bold text-primary">
              {formatCLP(totalAmount)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Ventas</p>
            <p className="text-2xl font-bold">{totalSales}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}