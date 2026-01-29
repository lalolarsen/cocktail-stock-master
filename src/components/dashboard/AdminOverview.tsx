import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Calendar, 
  DollarSign, 
  QrCode, 
  Store, 
  Package, 
  ClipboardList, 
  UtensilsCrossed,
  ShieldAlert,
  TrendingUp
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { OrphanSalesRecoveryDialog } from "./OrphanSalesRecoveryDialog";
import { LiveSalesChart } from "./overview/LiveSalesChart";
import { TopProductsChart } from "./overview/TopProductsChart";
import { StockAlertsPanel } from "./overview/StockAlertsPanel";

interface Jornada {
  id: string;
  numero_jornada: number;
  fecha: string;
  hora_apertura: string | null;
  estado: string;
}

interface TodayStats {
  salesToday: number;
  transactionsToday: number;
  qrsRedeemed: number;
  grossIncome: number;
}

interface BarStatus {
  id: string;
  name: string;
  status: 'operational' | 'low';
  lowCount: number;
  totalProducts: number;
}

interface Props {
  isReadOnly?: boolean;
  onNavigate?: (view: string) => void;
}

export function AdminOverview({ isReadOnly = false, onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [todayStats, setTodayStats] = useState<TodayStats>({ salesToday: 0, transactionsToday: 0, qrsRedeemed: 0, grossIncome: 0 });
  const [barStatuses, setBarStatuses] = useState<BarStatus[]>([]);
  const [orphanSalesCount, setOrphanSalesCount] = useState(0);
  const [showOrphanDialog, setShowOrphanDialog] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchJornada(),
        fetchTodayStats(),
        fetchBarStatuses(),
        fetchOrphanSalesCount()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrphanSalesCount = async () => {
    const { count, error } = await supabase
      .from("sales")
      .select("*", { count: "exact", head: true })
      .is("jornada_id", null);
    
    if (!error) {
      setOrphanSalesCount(count || 0);
    }
  };

  const fetchJornada = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("jornadas")
      .select("id, numero_jornada, fecha, hora_apertura, estado")
      .or(`estado.eq.activa,fecha.eq.${today}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setJornada(data);
  };

  const fetchTodayStats = async () => {
    const today = new Date().toISOString().split("T")[0];
    
    // Sales today
    const { data: salesData } = await supabase
      .from("sales")
      .select("total_amount")
      .gte("created_at", `${today}T00:00:00`)
      .eq("payment_status", "paid")
      .eq("is_cancelled", false);
    
    // Ticket sales today
    const { data: ticketData } = await supabase
      .from("ticket_sales")
      .select("total")
      .gte("created_at", `${today}T00:00:00`)
      .eq("payment_status", "paid");

    // QRs redeemed today
    const { count: qrCount } = await supabase
      .from("pickup_redemptions_log")
      .select("*", { count: "exact", head: true })
      .gte("redeemed_at", `${today}T00:00:00`)
      .eq("result", "success");

    // Gross income today
    const { data: incomeData } = await supabase
      .from("gross_income_entries")
      .select("amount")
      .gte("created_at", `${today}T00:00:00`);

    const barSalesTotal = salesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const ticketSalesTotal = ticketData?.reduce((sum, t) => sum + t.total, 0) || 0;
    const transactionsCount = (salesData?.length || 0) + (ticketData?.length || 0);
    const grossIncomeTotal = incomeData?.reduce((sum, i) => sum + i.amount, 0) || 0;

    setTodayStats({
      salesToday: barSalesTotal + ticketSalesTotal,
      transactionsToday: transactionsCount,
      qrsRedeemed: qrCount || 0,
      grossIncome: grossIncomeTotal
    });
  };

  const fetchBarStatuses = async () => {
    // Get bar locations
    const { data: bars } = await supabase
      .from("stock_locations")
      .select("id, name")
      .eq("type", "bar")
      .eq("is_active", true);

    if (!bars?.length) {
      setBarStatuses([]);
      return;
    }

    // Get products with minimum stock
    const { data: products } = await supabase
      .from("products")
      .select("id, minimum_stock");

    const productMinMap = new Map(products?.map(p => [p.id, p.minimum_stock]) || []);

    // Get stock balances for bars
    const { data: balances } = await supabase
      .from("stock_balances")
      .select("location_id, product_id, quantity")
      .in("location_id", bars.map(b => b.id));

    // Calculate bar statuses
    const statuses: BarStatus[] = bars.map(bar => {
      const barBalances = balances?.filter(b => b.location_id === bar.id) || [];
      const lowCount = barBalances.filter(b => {
        const minStock = productMinMap.get(b.product_id) || 0;
        return Number(b.quantity) < minStock * 0.5;
      }).length;
      
      return {
        id: bar.id,
        name: bar.name,
        status: lowCount > 3 ? 'low' : 'operational',
        lowCount,
        totalProducts: barBalances.length
      };
    });

    setBarStatuses(statuses);
  };

  const getJornadaStatus = () => {
    if (!jornada) return { label: "Sin jornada", variant: "outline" as const };
    if (jornada.estado === "activa") return { label: "Activa", variant: "default" as const };
    return { label: "Cerrada", variant: "secondary" as const };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const jornadaStatus = getJornadaStatus();

  return (
    <div className="space-y-6">
      {/* Orphan Sales Alert Banner */}
      {!isReadOnly && orphanSalesCount > 0 && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-700">
              Hay <strong>{orphanSalesCount}</strong> ventas sin jornada. Debes reasignarlas para que entren al estado de resultados.
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowOrphanDialog(true)}
              className="ml-4 border-amber-500/50 text-amber-700 hover:bg-amber-500/20"
            >
              Reasignar ventas
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Orphan Sales Recovery Dialog */}
      <OrphanSalesRecoveryDialog
        open={showOrphanDialog}
        onOpenChange={setShowOrphanDialog}
        orphanCount={orphanSalesCount}
        onRecoveryComplete={() => {
          fetchOrphanSalesCount();
          fetchTodayStats();
        }}
      />

      {/* A) Estado de hoy - Enhanced Visual Design */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Jornada Status Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10" />
          <CardContent className="relative p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Jornada</p>
            </div>
            <div className="space-y-1">
              <Badge 
                variant={jornadaStatus.variant}
                className={`text-sm px-3 py-1 ${jornada?.estado === "activa" ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}
              >
                {jornadaStatus.label}
              </Badge>
              {jornada?.estado === "activa" && jornada.hora_apertura && (
                <p className="text-xs text-muted-foreground mt-2">Desde las {jornada.hora_apertura}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gross Income Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-500/10" />
          <CardContent className="relative p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Ingresos brutos</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{formatCLP(todayStats.grossIncome)}</p>
          </CardContent>
        </Card>

        {/* Sales Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-500/10" />
          <CardContent className="relative p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Ventas</p>
            </div>
            <p className="text-2xl font-bold">{formatCLP(todayStats.salesToday)}</p>
            <p className="text-xs text-muted-foreground mt-1">{todayStats.transactionsToday} transacciones</p>
          </CardContent>
        </Card>

        {/* QRs Redeemed Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-violet-500/10" />
          <CardContent className="relative p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-violet-500/10">
                <QrCode className="h-5 w-5 text-violet-600" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">QRs canjeados</p>
            </div>
            <p className="text-2xl font-bold text-violet-600">{todayStats.qrsRedeemed}</p>
          </CardContent>
        </Card>

        {/* Bar Status Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-amber-500/10" />
          <CardContent className="relative p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Store className="h-5 w-5 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Barras</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {barStatuses.length === 0 ? (
                <span className="text-sm text-muted-foreground">Sin barras</span>
              ) : (
                barStatuses.map(bar => (
                  <Badge 
                    key={bar.id} 
                    variant={bar.status === 'operational' ? 'outline' : 'destructive'}
                    className={`text-xs ${bar.status === 'operational' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}`}
                  >
                    {bar.name.replace('Barra ', '')}: {bar.status === 'operational' ? '✓' : '↓'}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* C) Live Charts & Alerts */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <LiveSalesChart />
        <TopProductsChart />
        <StockAlertsPanel onNavigate={onNavigate} />
      </div>

    </div>
  );
}
