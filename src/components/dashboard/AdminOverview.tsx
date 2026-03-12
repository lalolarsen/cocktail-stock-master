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
  ShieldAlert,
  TrendingUp,
  Play,
  AlertTriangle,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { OrphanSalesRecoveryDialog } from "./OrphanSalesRecoveryDialog";
import { LiveSalesChart } from "./overview/LiveSalesChart";
import { TopProductsChart } from "./overview/TopProductsChart";
import { StockAlertsPanel } from "./overview/StockAlertsPanel";
import { COGSBreakdownPanel } from "./overview/COGSBreakdownPanel";

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
  is_active: boolean;
}

interface Props {
  isReadOnly?: boolean;
  onNavigate?: (view: string) => void;
}

/* ─── Small metric card ─── */
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  negative,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  negative?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            {label}
          </p>
          <p
            className={`text-2xl font-bold tabular-nums leading-tight ${
              negative ? "text-destructive" : "text-foreground"
            }`}
          >
            {value}
          </p>
          {sub && (
            <p className="text-xs text-muted-foreground">{sub}</p>
          )}
        </div>
        <Icon
          className={`w-5 h-5 shrink-0 mt-0.5 opacity-20 ${
            negative ? "text-destructive" : "text-muted-foreground"
          }`}
        />
      </CardContent>
    </Card>
  );
}

export function AdminOverview({ isReadOnly = false, onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [todayStats, setTodayStats] = useState<TodayStats>({
    salesToday: 0,
    transactionsToday: 0,
    qrsRedeemed: 0,
    grossIncome: 0,
  });
  const [barStatuses, setBarStatuses] = useState<BarStatus[]>([]);
  const [orphanSalesCount, setOrphanSalesCount] = useState(0);
  const [showOrphanDialog, setShowOrphanDialog] = useState(false);

  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    fetchData();
    supabase
      .from("jornadas")
      .select("*", { count: "exact", head: true })
      .eq("requires_review", true)
      .then(({ count }) => setPendingReviewCount(count || 0));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchJornada(),
        fetchTodayStats(),
        fetchBarStatuses(),
        fetchOrphanSalesCount(),
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
    if (!error) setOrphanSalesCount(count || 0);
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

    const { data: salesData } = await supabase
      .from("sales")
      .select("total_amount")
      .gte("created_at", `${today}T00:00:00`)
      .eq("payment_status", "paid")
      .eq("is_cancelled", false);

    const { data: ticketData } = await supabase
      .from("ticket_sales")
      .select("total")
      .gte("created_at", `${today}T00:00:00`)
      .eq("payment_status", "paid");

    const { count: qrCount } = await supabase
      .from("pickup_redemptions_log")
      .select("*", { count: "exact", head: true })
      .gte("redeemed_at", `${today}T00:00:00`)
      .eq("result", "success");

    const { data: incomeData } = await supabase
      .from("gross_income_entries")
      .select("amount")
      .gte("created_at", `${today}T00:00:00`);

    const barSalesTotal =
      salesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const ticketSalesTotal =
      ticketData?.reduce((sum, t) => sum + t.total, 0) || 0;
    const transactionsCount =
      (salesData?.length || 0) + (ticketData?.length || 0);
    const grossIncomeTotal =
      incomeData?.reduce((sum, i) => sum + i.amount, 0) || 0;

    setTodayStats({
      salesToday: barSalesTotal + ticketSalesTotal,
      transactionsToday: transactionsCount,
      qrsRedeemed: qrCount || 0,
      grossIncome: grossIncomeTotal,
    });
  };

  const fetchBarStatuses = async () => {
    const { data: bars } = await supabase
      .from("stock_locations")
      .select("id, name, is_active")
      .eq("type", "bar")
      .order("name");

    if (!bars?.length) {
      setBarStatuses([]);
      return;
    }

    setBarStatuses(bars.map((bar) => ({
      id: bar.id,
      name: bar.name,
      is_active: bar.is_active,
    })));
  };

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <div className="space-y-10">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const jornadaActive = jornada?.estado === "activa";
  const noSales = todayStats.salesToday === 0 && todayStats.transactionsToday === 0;

  return (
    <div className="space-y-10">
      {/* ── No-jornada banner for admin/gerencia ── */}
      {!jornadaActive && !isReadOnly && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-700 dark:text-amber-200">
              <strong>Sin jornada activa</strong> — abre una para que el equipo pueda operar.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate?.("jornadas")}
              className="ml-4 border-amber-500/50 text-amber-700 hover:bg-amber-500/20"
            >
              <Play className="w-3 h-3 mr-1" />
              Abrir jornada
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Orphan Sales Alert ── */}
      {!isReadOnly && orphanSalesCount > 0 && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-700">
              Hay <strong>{orphanSalesCount}</strong> ventas sin jornada.
              Debes reasignarlas para que entren al estado de resultados.
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

      {/* ── Pending Review Alert ── */}
      {pendingReviewCount > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-destructive">
              <strong>{pendingReviewCount} jornada{pendingReviewCount > 1 ? "s" : ""}</strong> con cierre forzado pendiente{pendingReviewCount > 1 ? "s" : ""} de revisión.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate?.("jornadas")}
              className="ml-4 border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              Ver jornadas
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <OrphanSalesRecoveryDialog
        open={showOrphanDialog}
        onOpenChange={setShowOrphanDialog}
        orphanCount={orphanSalesCount}
        onRecoveryComplete={() => {
          fetchOrphanSalesCount();
          fetchTodayStats();
        }}
      />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           BLOQUE 1 — Operación en vivo
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Operación en vivo
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Jornada */}
          {jornadaActive ? (
            <StatCard
              label="Jornada"
              value={`#${jornada!.numero_jornada}`}
              sub={jornada!.hora_apertura ? `Desde las ${jornada!.hora_apertura}` : undefined}
              icon={Calendar}
            />
          ) : (
            <Card className="relative overflow-hidden">
              <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-2 min-h-[112px]">
                <Calendar className="w-6 h-6 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">
                  No hay jornada activa.
                </p>
                {!isReadOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7 text-xs"
                    onClick={() => onNavigate?.("jornadas")}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Iniciar jornada
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Ingresos */}
          <StatCard
            label="Ingresos brutos"
            value={formatCLP(todayStats.grossIncome)}
            icon={TrendingUp}
          />

          {/* Ventas */}
          {noSales ? (
            <Card className="relative overflow-hidden">
              <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-1 min-h-[112px]">
                <DollarSign className="w-5 h-5 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">
                  Aún no hay ventas en esta jornada.
                </p>
              </CardContent>
            </Card>
          ) : (
            <StatCard
              label="Ventas"
              value={formatCLP(todayStats.salesToday)}
              sub={`${todayStats.transactionsToday} transacciones`}
              icon={DollarSign}
            />
          )}

          {/* QRs */}
          <StatCard
            label="QRs canjeados"
            value={todayStats.qrsRedeemed}
            icon={QrCode}
          />

          {/* Barras */}
          <Card className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                  Barras
                </p>
                <Store className="w-5 h-5 text-muted-foreground opacity-20 shrink-0" />
              </div>
              {barStatuses.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-3">Sin barras configuradas</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {barStatuses.map((bar) => (
                    <li key={bar.id} className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          bar.status === "operational"
                            ? "bg-primary"
                            : "bg-destructive"
                        }`}
                      />
                      <span className="truncate">{bar.name}</span>
                      {bar.status === "low" && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                          {bar.lowCount} bajos
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           BLOQUE 2 — KPIs de la jornada
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          KPIs de la jornada
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <LiveSalesChart />
          <TopProductsChart />
          <COGSBreakdownPanel compact />
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           BLOQUE 3 — Alertas y estado
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Alertas y estado
        </h2>
        <div className="grid md:grid-cols-1 lg:grid-cols-1 gap-3">
          <StockAlertsPanel onNavigate={onNavigate} />
        </div>
      </section>
    </div>
  );
}
