import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
  Hash,
  Clock,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { OrphanSalesRecoveryDialog } from "./OrphanSalesRecoveryDialog";
import { JornadaKPIPanel } from "./overview/JornadaKPIPanel";
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
  avgTicket: number;
  cashSales: number;
  cardSales: number;
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

/* ─── Metric cell (inline, no card wrapper) ─── */
function MetricCell({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-start gap-3 p-3 sm:p-4">
      <div className="p-2 rounded-lg bg-muted/60 shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-medium leading-none">
          {label}
        </p>
        <p className="text-lg sm:text-xl font-bold tabular-nums leading-tight text-foreground">
          {value}
        </p>
        {sub && (
          <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{sub}</p>
        )}
      </div>
    </div>
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
    avgTicket: 0,
    cashSales: 0,
    cardSales: 0,
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
      const activeJornada = await fetchJornada();
      await Promise.all([
        fetchTodayStats(activeJornada?.id),
        fetchBarStatuses(activeJornada?.id),
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

  const fetchJornada = async (): Promise<Jornada | null> => {
    const todayChile = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const { data } = await supabase
      .from("jornadas")
      .select("id, numero_jornada, fecha, hora_apertura, estado")
      .or(`estado.eq.activa,fecha.eq.${todayChile}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setJornada(data);
    return data;
  };

  const fetchTodayStats = async (jornadaId?: string) => {
    if (!jornadaId) return;

    const { data: salesData } = await supabase
      .from("sales")
      .select("total_amount, payment_method")
      .eq("jornada_id", jornadaId)
      .eq("payment_status", "paid")
      .eq("is_cancelled", false);

    const { data: ticketData } = await supabase
      .from("ticket_sales")
      .select("total")
      .eq("jornada_id", jornadaId)
      .eq("payment_status", "paid");

    const { count: qrCount } = await supabase
      .from("pickup_redemptions_log")
      .select("*", { count: "exact", head: true })
      .eq("jornada_id", jornadaId)
      .eq("result", "success");

    const { data: incomeData } = await supabase
      .from("gross_income_entries")
      .select("amount")
      .eq("jornada_id", jornadaId);

    const barSalesTotal = salesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const ticketSalesTotal = ticketData?.reduce((sum, t) => sum + t.total, 0) || 0;
    const transactionsCount = (salesData?.length || 0) + (ticketData?.length || 0);
    const grossIncomeTotal = incomeData?.reduce((sum, i) => sum + i.amount, 0) || 0;
    const totalSales = barSalesTotal + ticketSalesTotal;
    const avgTicket = transactionsCount > 0 ? Math.round(totalSales / transactionsCount) : 0;

    const cashSales = salesData?.filter(s => s.payment_method === "cash").reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
    const cardSales = salesData?.filter(s => s.payment_method !== "cash").reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

    setTodayStats({
      salesToday: totalSales,
      transactionsToday: transactionsCount,
      qrsRedeemed: qrCount || 0,
      grossIncome: grossIncomeTotal,
      avgTicket,
      cashSales,
      cardSales,
    });
  };

  const fetchBarStatuses = async (jornadaId?: string) => {
    if (!jornadaId) {
      setBarStatuses([]);
      return;
    }

    // Only show bars assigned to the current jornada
    const { data: assignments } = await supabase
      .from("jornada_bar_assignments")
      .select("location_id, stock_locations:location_id(id, name, is_active)")
      .eq("jornada_id", jornadaId);

    const bars = assignments
      ?.map((a) => {
        const loc = a.stock_locations as unknown as { id: string; name: string; is_active: boolean } | null;
        return loc ? { id: loc.id, name: loc.name, is_active: loc.is_active } : null;
      })
      .filter(Boolean) as BarStatus[] || [];

    setBarStatuses(bars);
  };

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const jornadaActive = jornada?.estado === "activa";
  const activeBars = barStatuses.filter(b => b.is_active);

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* ── Alerts (compact on mobile) ── */}
      {!jornadaActive && !isReadOnly && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-amber-400 text-sm">
              <strong>Sin jornada activa</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate?.("jornadas")}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-7 text-xs w-fit"
            >
              <Play className="w-3 h-3 mr-1" />
              Abrir
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isReadOnly && orphanSalesCount > 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-amber-400 text-sm">
              <strong>{orphanSalesCount}</strong> ventas sin jornada
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOrphanDialog(true)}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-7 text-xs w-fit"
            >
              Reasignar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {pendingReviewCount > 0 && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-destructive text-sm">
              <strong>{pendingReviewCount}</strong> jornada{pendingReviewCount > 1 ? "s" : ""} pendiente{pendingReviewCount > 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate?.("jornadas")}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 h-7 text-xs w-fit"
            >
              Revisar
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

      {/* ━━━ Sin jornada → empty state ━━━ */}
      {!jornadaActive && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="p-3 rounded-full bg-muted">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No hay jornada activa</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Abre una jornada para ver métricas de operación en vivo, KPIs y alertas de stock.
              </p>
            </div>
            {!isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.("jornadas")}
                className="mt-2"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                Abrir jornada
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ━━━ Con jornada activa → contenido completo ━━━ */}
      {jornadaActive && (
        <>
          {/* BLOQUE 1 — Operación en vivo */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Operación en vivo
            </h2>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="font-semibold">Jornada #{jornada!.numero_jornada}</span>
                  {jornada!.hora_apertura && (
                    <span className="text-muted-foreground text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {jornada!.hora_apertura}
                    </span>
                  )}
                </div>
                {activeBars.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Store className="w-3 h-3" />
                    <span>{activeBars.length} barra{activeBars.length > 1 ? "s" : ""}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                )}
              </div>
              <CardContent className="p-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-border">
                  <MetricCell label="Ingresos brutos" value={formatCLP(todayStats.grossIncome)} icon={TrendingUp} />
                  <MetricCell label="Ventas" value={formatCLP(todayStats.salesToday)} sub={`${todayStats.transactionsToday} tx`} icon={DollarSign} />
                  <MetricCell label="Ticket prom." value={todayStats.avgTicket > 0 ? formatCLP(todayStats.avgTicket) : "—"} icon={Hash} />
                  <MetricCell label="QRs canjeados" value={todayStats.qrsRedeemed} icon={QrCode} />
                  <MetricCell label="Efectivo" value={formatCLP(todayStats.cashSales)} icon={DollarSign} />
                  <MetricCell label="Tarjeta" value={formatCLP(todayStats.cardSales)} icon={DollarSign} />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* BLOQUE 2 — KPIs de la jornada */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              KPIs de la jornada
            </h2>
            <JornadaKPIPanel jornadaId={jornada?.id} />
          </section>

          {/* BLOQUE 3 — Alertas y estado */}
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Alertas y estado
            </h2>
            <StockAlertsPanel onNavigate={onNavigate} />
          </section>
        </>
      )}
    </div>
  );
}
