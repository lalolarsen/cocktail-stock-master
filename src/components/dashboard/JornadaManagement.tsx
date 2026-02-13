import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Loader2, 
  Calendar, 
  History, 
  BarChart3,
  AlertTriangle,
  Settings,
  Play,
  Square,
  CheckCircle,
  ShoppingCart,
  DollarSign,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Store,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { JornadaCashOpeningDialog } from "./JornadaCashOpeningDialog";
import { JornadaCashSettingsCard } from "./JornadaCashSettingsCard";
import { CashReconciliationDialog } from "./CashReconciliationDialog";
import { formatCLP } from "@/lib/currency";
import { logAuditEvent } from "@/lib/monitoring";
import { JornadaHistoryTable } from "./jornada/JornadaHistoryTable";
import { LiveJornadaStats } from "./jornada/LiveJornadaStats";
import { JornadaDetailDrawer } from "./jornada/JornadaDetailDrawer";
import { useAppSession } from "@/contexts/AppSessionContext";

const STALE_JORNADA_THRESHOLD_HOURS = 24;

interface Jornada {
  id: string;
  numero_jornada: number;
  nombre?: string;
  semana_inicio: string;
  fecha: string;
  hora_apertura: string | null;
  hora_cierre: string | null;
  estado: string;
  created_at: string;
}

interface JornadaStats {
  total_ventas: number;
  cantidad_ventas: number;
  productos_vendidos: number;
  logins: number;
}

interface FinancialSummary {
  id: string;
  jornada_id: string;
  pos_id: string | null;
  gross_sales_total: number;
  sales_by_payment: { cash?: number; card?: number; transfer?: number };
  transactions_count: number;
  cancelled_sales_total: number;
  net_sales_total: number;
  expenses_total: number;
  expenses_by_type: { operacional?: number; no_operacional?: number };
  opening_cash: number;
  cash_sales: number;
  cash_expenses: number;
  expected_cash: number;
  counted_cash: number;
  cash_difference: number;
  net_operational_result: number;
  closed_at: string;
  closed_by: string;
}

export function JornadaManagement() {
  const { hasActiveJornada } = useAppSession();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [jornadaStats, setJornadaStats] = useState<Record<string, JornadaStats>>({});
  const [financialSummaries, setFinancialSummaries] = useState<Record<string, FinancialSummary>>({});
  const [loading, setLoading] = useState(true);
  const [showCashOpening, setShowCashOpening] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeJornada, setActiveJornada] = useState<Jornada | null>(null);
  const [showForceCloseConfirm, setShowForceCloseConfirm] = useState<Jornada | null>(null);
  const [forceCloseLoading, setForceCloseLoading] = useState(false);
  const [detailDrawerJornadaId, setDetailDrawerJornadaId] = useState<string | null>(null);
  const [activePosCount, setActivePosCount] = useState(0);

  useEffect(() => {
    fetchJornadas();
    fetchActivePosCount();
    
    const channel = supabase
      .channel("jornada-management")
      .on("postgres_changes", { event: "*", schema: "public", table: "jornadas" }, () => fetchJornadas())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchActivePosCount = async () => {
    const { count } = await supabase
      .from("pos_terminals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_cash_register", true);
    setActivePosCount(count || 0);
  };

  const fetchJornadas = async () => {
    try {
      const { data, error } = await supabase
        .from("jornadas")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(50);

      if (error) throw error;
      setJornadas(data || []);
      
      const active = data?.find(j => j.estado === "activa") || null;
      setActiveJornada(active);
      
      if (data && data.length > 0) {
        const ids = data.map(j => j.id);
        await Promise.all([fetchJornadaStats(ids), fetchFinancialSummaries(ids)]);
      }
    } catch (error) {
      console.error("Error fetching jornadas:", error);
      toast.error("Error al cargar jornadas");
    } finally {
      setLoading(false);
    }
  };

  const fetchFinancialSummaries = async (jornadaIds: string[]) => {
    try {
      const { data } = await supabase
        .from("jornada_financial_summary")
        .select("*")
        .in("jornada_id", jornadaIds)
        .is("pos_id", null);

      const summaries: Record<string, FinancialSummary> = {};
      (data || []).forEach((s) => { summaries[s.jornada_id] = s as unknown as FinancialSummary; });
      setFinancialSummaries(summaries);
    } catch (error) {
      console.error("Error fetching financial summaries:", error);
    }
  };

  const fetchJornadaStats = async (jornadaIds: string[]) => {
    try {
      const { data: salesData } = await supabase
        .from("sales")
        .select("id, jornada_id, total_amount, is_cancelled, sale_items(quantity)")
        .in("jornada_id", jornadaIds)
        .eq("is_cancelled", false);

      const { data: loginData } = await supabase
        .from("login_history")
        .select("jornada_id")
        .in("jornada_id", jornadaIds);

      const stats: Record<string, JornadaStats> = {};
      jornadaIds.forEach(id => {
        const jornadaSales = salesData?.filter(s => s.jornada_id === id) || [];
        const jornadaLogins = loginData?.filter(l => l.jornada_id === id) || [];
        stats[id] = {
          total_ventas: jornadaSales.reduce((sum, s) => sum + Number(s.total_amount), 0),
          cantidad_ventas: jornadaSales.length,
          productos_vendidos: jornadaSales.reduce((sum, s) => 
            sum + (s.sale_items?.reduce((itemSum: number, item: { quantity: number }) => itemSum + item.quantity, 0) || 0), 0),
          logins: jornadaLogins.length,
        };
      });
      setJornadaStats(stats);
    } catch (error) {
      console.error("Error fetching jornada stats:", error);
    }
  };

  const handleOpenJornada = () => {
    if (activeJornada) {
      toast.error("Ya existe una jornada abierta. Ciérrela antes de abrir una nueva.");
      return;
    }
    setShowCashOpening(true);
  };

  const handleOpeningSuccess = () => {
    setShowCashOpening(false);
    toast.success("Jornada abierta exitosamente");
    fetchJornadas();
  };

  const handleForceClose = async () => {
    if (!showForceCloseConfirm) return;
    setForceCloseLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Debe iniciar sesión"); return; }

      const { data: jornadaData } = await supabase
        .from("jornadas").select("venue_id").eq("id", showForceCloseConfirm.id).single();

      const { error: updateError } = await supabase
        .from("jornadas")
        .update({ estado: "cerrada", hora_cierre: format(new Date(), "HH:mm:ss"), updated_at: new Date().toISOString() })
        .eq("id", showForceCloseConfirm.id);

      if (updateError) throw updateError;

      await supabase.from("jornada_audit_log").insert({
        jornada_id: showForceCloseConfirm.id,
        venue_id: jornadaData?.venue_id || null,
        actor_user_id: user.id,
        actor_source: "ui",
        action: "forced_close",
        reason: `Jornada forzadamente cerrada por admin - abierta por más de ${STALE_JORNADA_THRESHOLD_HOURS} horas`,
        meta: { arqueo_skipped: true, jornada_numero: showForceCloseConfirm.numero_jornada },
      });

      await logAuditEvent({ action: "jornada_forced_close", status: "success", metadata: { jornada_id: showForceCloseConfirm.id } });

      toast.success("Jornada cerrada forzosamente.");
      setShowForceCloseConfirm(null);
      fetchJornadas();
    } catch (error) {
      console.error("Error force closing jornada:", error);
      toast.error("Error al forzar cierre de jornada");
    } finally {
      setForceCloseLoading(false);
    }
  };

  const handleCloseJornada = (jornadaId: string) => { setShowReconciliation(jornadaId); };

  const handleReconciliationComplete = () => {
    setShowReconciliation(null);
    toast.success("Jornada cerrada exitosamente");
    fetchJornadas();
  };

  const deleteJornada = async (jornadaId: string) => {
    const stats = jornadaStats[jornadaId];
    if (stats && stats.cantidad_ventas > 0) { toast.error("No se puede eliminar una jornada con ventas registradas"); return; }
    const jornada = jornadas.find(j => j.id === jornadaId);
    if (jornada?.estado === "activa") { toast.error("No se puede eliminar una jornada abierta"); return; }

    setActionLoading(jornadaId);
    try {
      const { error } = await supabase.from("jornadas").delete().eq("id", jornadaId);
      if (error) throw error;
      toast.success("Jornada eliminada");
      fetchJornadas();
    } catch (error) {
      console.error("Error deleting jornada:", error);
      toast.error("Error al eliminar jornada");
    } finally {
      setActionLoading(null);
    }
  };

  const exportJornadaCSV = (jornada: Jornada) => {
    const summary = financialSummaries[jornada.id];
    if (!summary) { toast.error("No hay resumen financiero disponible"); return; }

    const rows = [
      ["Cierre de Jornada"],
      [jornada.nombre || `Jornada #${jornada.numero_jornada}`],
      [`Fecha: ${format(parseISO(jornada.fecha), "dd/MM/yyyy", { locale: es })}`],
      [`Cerrada: ${format(new Date(summary.closed_at), "dd/MM/yyyy HH:mm", { locale: es })}`],
      [""],
      ["Concepto", "Monto (CLP)"],
      ["Ventas Brutas", summary.gross_sales_total],
      ["Ventas Canceladas", -summary.cancelled_sales_total],
      ["Ventas Netas", summary.net_sales_total],
      ["Gastos Totales", -summary.expenses_total],
      ["Resultado Operacional", summary.net_operational_result],
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cierre_${(jornada.nombre || jornada.id).slice(0, 30).replace(/\s/g, "_")}.csv`;
    link.click();
    toast.success("CSV exportado");
  };

  // Live stats for active jornada
  const activeStats = activeJornada ? jornadaStats[activeJornada.id] : null;
  const activeSummary = activeJornada ? financialSummaries[activeJornada.id] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Jornadas</h2>
          <p className="text-sm text-muted-foreground">
            Control de turnos y cierre con arqueo por POS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={activeJornada ? "default" : "secondary"} className={activeJornada ? "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30" : ""}>
            {activeJornada ? "Activa" : "Sin jornada"}
          </Badge>
          {!activeJornada ? (
            <Button onClick={handleOpenJornada} disabled={hasActiveJornada} className="gap-2">
              <Play className="w-4 h-4" />
              Abrir Jornada
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => handleCloseJornada(activeJornada.id)} className="gap-2">
              <Square className="w-4 h-4" />
              Cerrar Jornada
            </Button>
          )}
        </div>
      </div>

      {/* ── Hero Card ── */}
      {!activeJornada ? (
        <Card className="p-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <Calendar className="w-7 h-7 text-amber-600" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-xl font-semibold text-amber-700 dark:text-amber-300">
                  Sin jornada abierta
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Las ventas están bloqueadas hasta abrir jornada.
                </p>
              </div>

              <Button onClick={handleOpenJornada} disabled={hasActiveJornada} size="lg" className="gap-2">
                <Play className="w-4 h-4" />
                Abrir Jornada
              </Button>

              <div className="space-y-1.5 pt-2">
                <ChecklistItem text="Se solicitará nombre de jornada" />
                <ChecklistItem text="Se solicitarán montos iniciales por POS" />
                <ChecklistItem text="El cierre requerirá arqueo obligatorio por POS" />
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 border-green-500/30 bg-green-500/5">
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
              <Calendar className="w-7 h-7 text-green-600" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold">
                    {activeJornada.nombre || `Jornada ${activeJornada.numero_jornada}`}
                  </h3>
                  <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">
                    Abierta
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1 capitalize">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(parseISO(activeJornada.fecha), "EEEE d MMM", { locale: es })}
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Apertura {activeJornada.hora_apertura?.slice(0, 5)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Store className="w-3.5 h-3.5" />
                    {activePosCount} POS
                  </span>
                </div>
              </div>

              {/* Mini metrics */}
              {activeStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MiniMetric icon={<DollarSign className="w-4 h-4" />} label="Ventas" value={formatCLP(activeStats.total_ventas)} />
                  <MiniMetric icon={<ShoppingCart className="w-4 h-4" />} label="Transacciones" value={String(activeStats.cantidad_ventas)} />
                  <MiniMetric icon={<Banknote className="w-4 h-4" />} label="Efectivo" value={activeSummary ? formatCLP(activeSummary.cash_sales || 0) : "-"} />
                  <MiniMetric icon={<CreditCard className="w-4 h-4" />} label="Tarjeta" value={activeSummary ? formatCLP((activeSummary.sales_by_payment?.card || 0)) : "-"} />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="destructive" onClick={() => handleCloseJornada(activeJornada.id)} className="gap-2">
                  <Square className="w-4 h-4" />
                  Cerrar Jornada
                </Button>
                <Button variant="ghost" onClick={() => setDetailDrawerJornadaId(activeJornada.id)} className="gap-2">
                  <ArrowRightLeft className="w-4 h-4" />
                  Reconciliar Caja
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Main Content ── */}
      <Tabs defaultValue={activeJornada ? "live" : "history"} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="live" className="gap-2" disabled={!activeJornada}>
            <BarChart3 className="w-4 h-4" />
            En Vivo
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          {activeJornada ? (
            <LiveJornadaStats jornadaId={activeJornada.id} />
          ) : (
            <Card className="p-8">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Sin jornada activa</p>
                <p className="text-sm">Abre una jornada para ver los resultados en tiempo real</p>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <JornadaHistoryTable
            jornadas={jornadas}
            jornadaStats={jornadaStats}
            financialSummaries={financialSummaries}
            actionLoading={actionLoading}
            onCloseJornada={handleCloseJornada}
            onDeleteJornada={deleteJornada}
            onForceClose={(j) => setShowForceCloseConfirm(j)}
            onShowDetail={(id) => setDetailDrawerJornadaId(id)}
            onExportCSV={exportJornadaCSV}
          />
        </TabsContent>

        <TabsContent value="settings">
          <JornadaCashSettingsCard />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}
      <JornadaCashOpeningDialog
        open={showCashOpening}
        onClose={() => setShowCashOpening(false)}
        jornadaId={null}
        onSuccess={handleOpeningSuccess}
      />

      {showReconciliation && (
        <CashReconciliationDialog
          open={true}
          onClose={() => setShowReconciliation(null)}
          onReconciled={handleReconciliationComplete}
          jornadaId={showReconciliation}
        />
      )}

      <JornadaDetailDrawer
        open={!!detailDrawerJornadaId}
        onClose={() => setDetailDrawerJornadaId(null)}
        jornadaId={detailDrawerJornadaId}
      />

      {/* Force Close Confirmation */}
      <Dialog open={!!showForceCloseConfirm} onOpenChange={() => setShowForceCloseConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Forzar Cierre de Jornada
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <p>
                Esta acción cerrará la jornada "<strong>{showForceCloseConfirm?.nombre || `#${showForceCloseConfirm?.numero_jornada}`}</strong>" de forma forzada.
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">⚠️ Advertencias:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>El arqueo de caja será <strong>omitido</strong></li>
                  <li>No se generará resumen financiero automático</li>
                  <li>Esta acción es <strong>irreversible</strong></li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowForceCloseConfirm(null)} disabled={forceCloseLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleForceClose} disabled={forceCloseLoading} className="bg-amber-600 hover:bg-amber-700">
              {forceCloseLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cerrando...</> : <><AlertTriangle className="w-4 h-4 mr-2" />Confirmar Cierre Forzado</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <ClipboardCheck className="w-4 h-4 text-primary shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-background border">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className="font-bold text-lg">{value}</p>
    </div>
  );
}
