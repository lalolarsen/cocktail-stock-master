import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllByIds } from "@/lib/supabase-batch";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Loader2, 
  Calendar, 
  AlertTriangle,
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
  Settings,
  ChevronDown,
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
  const { hasActiveJornada, role } = useAppSession();
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
  const [forceCloseReason, setForceCloseReason] = useState("");
  const [forceCloseDifference, setForceCloseDifference] = useState<number | null>(null);
  const [showDoubleConfirm, setShowDoubleConfirm] = useState(false);
  const [detailDrawerJornadaId, setDetailDrawerJornadaId] = useState<string | null>(null);
  const [activePosCount, setActivePosCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetchJornadas();
    fetchActivePosCount();
    fetchPendingReviewCount();
    
    const channel = supabase
      .channel("jornada-management")
      .on("postgres_changes", { event: "*", schema: "public", table: "jornadas" }, () => {
        fetchJornadas();
        fetchPendingReviewCount();
      })
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

  const fetchPendingReviewCount = async () => {
    const { count } = await supabase
      .from("jornadas")
      .select("*", { count: "exact", head: true })
      .eq("requires_review", true);
    setPendingReviewCount(count || 0);
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
      
      const now = new Date();
      const santiagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
      const today = `${santiagoDate.getFullYear()}-${String(santiagoDate.getMonth() + 1).padStart(2, "0")}-${String(santiagoDate.getDate()).padStart(2, "0")}`;
      const active = data?.find(j => j.estado === "activa" && j.fecha === today) || null;
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
      const [salesData, loginData] = await Promise.all([
        fetchAllByIds(
          "sales",
          "jornada_id",
          jornadaIds,
          "id, jornada_id, total_amount, is_cancelled, sale_items(quantity)"
        ).then((rows: any[]) => rows.filter((s: any) => !s.is_cancelled)),
        fetchAllByIds(
          "login_history",
          "jornada_id",
          jornadaIds,
          "jornada_id"
        ),
      ]);

      const stats: Record<string, JornadaStats> = {};
      jornadaIds.forEach(id => {
        const jornadaSales = salesData.filter((s: any) => s.jornada_id === id);
        const jornadaLogins = loginData.filter((l: any) => l.jornada_id === id);
        stats[id] = {
          total_ventas: jornadaSales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
          cantidad_ventas: jornadaSales.length,
          productos_vendidos: jornadaSales.reduce((sum: number, s: any) => 
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

  const calculateForceCloseDifference = async (jornadaId: string) => {
    try {
      const { data: posTerminals } = await supabase
        .from("pos_terminals")
        .select("id")
        .eq("is_active", true)
        .eq("is_cash_register", true);

      let totalDiff = 0;
      for (const pos of (posTerminals || [])) {
        const [openingRes, salesRes, expensesRes] = await Promise.all([
          supabase.from("jornada_cash_openings").select("opening_cash_amount").eq("jornada_id", jornadaId).eq("pos_id", pos.id).maybeSingle(),
          supabase.from("sales").select("total_amount").eq("jornada_id", jornadaId).eq("payment_method", "cash").eq("is_cancelled", false),
          supabase.from("expenses").select("amount").eq("jornada_id", jornadaId).eq("payment_method", "cash"),
        ]);
        const opening = Number(openingRes.data?.opening_cash_amount || 0);
        const cashSales = (salesRes.data || []).reduce((s, r) => s + Number(r.total_amount), 0);
        const cashExpenses = (expensesRes.data || []).reduce((s, r) => s + Number(r.amount), 0);
        const expected = opening + cashSales - cashExpenses;
        totalDiff += (0 - expected);
      }
      setForceCloseDifference(totalDiff);
    } catch {
      setForceCloseDifference(null);
    }
  };

  const openForceCloseModal = (jornada: Jornada) => {
    setShowForceCloseConfirm(jornada);
    setForceCloseReason("");
    setForceCloseDifference(null);
    setShowDoubleConfirm(false);
    calculateForceCloseDifference(jornada.id);
  };

  const handleForceClose = async () => {
    if (!showForceCloseConfirm) return;
    if (forceCloseDifference !== null && Math.abs(forceCloseDifference) > 100000 && !showDoubleConfirm) {
      setShowDoubleConfirm(true);
      return;
    }

    setForceCloseLoading(true);
    try {
      const { data, error } = await supabase.rpc("force_close_jornada", {
        p_jornada_id: showForceCloseConfirm.id,
        p_reason: forceCloseReason.trim(),
      });

      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string; difference_total?: number };
      if (!result.success) {
        toast.error(result.error || "Error al forzar cierre");
        return;
      }

      await logAuditEvent({ action: "jornada_forced_close", status: "success", metadata: { jornada_id: showForceCloseConfirm.id, difference_total: result.difference_total } });
      toast.success("Jornada cerrada forzosamente. Requiere revisión administrativa.");
      setShowForceCloseConfirm(null);
      setForceCloseReason("");
      setShowDoubleConfirm(false);
      fetchJornadas();
    } catch (error) {
      console.error("Error force closing jornada:", error);
      toast.error("Error al forzar cierre de jornada");
    } finally {
      setForceCloseLoading(false);
    }
  };

  const handleCloseJornada = (jornadaId: string) => { setShowReconciliation(jornadaId); };

  const handleApproveReview = async (jornadaId: string) => {
    setActionLoading(jornadaId);
    try {
      const { error } = await supabase
        .from("jornadas")
        .update({ requires_review: false })
        .eq("id", jornadaId);
      if (error) throw error;
      await logAuditEvent({ action: "jornada_review_approved", status: "success", metadata: { jornada_id: jornadaId } });
      toast.success("Jornada aprobada. Revisión completada.");
      fetchJornadas();
      fetchPendingReviewCount();
    } catch (error) {
      console.error("Error approving review:", error);
      toast.error("Error al aprobar revisión");
    } finally {
      setActionLoading(null);
    }
  };

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
    <div className="space-y-4">
      {/* ── Pending Review Alert ── */}
      {pendingReviewCount > 0 && (
        <Alert className="border-destructive/50 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm">
            <strong>{pendingReviewCount} jornada(s)</strong> con cierre forzado pendiente(s) de revisión.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Compact Active Jornada Bar ── */}
      {!activeJornada ? (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-300">Sin jornada abierta</p>
                <p className="text-xs text-muted-foreground">Las ventas están bloqueadas</p>
              </div>
            </div>
            <Button onClick={handleOpenJornada} disabled={hasActiveJornada} className="gap-2 shrink-0">
              <Play className="w-4 h-4" />
              Abrir Jornada
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4 border-green-500/30 bg-green-500/5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{activeJornada.nombre || `Jornada ${activeJornada.numero_jornada}`}</p>
                    <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30 text-[10px]">Abierta</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">{format(parseISO(activeJornada.fecha), "EEE d MMM", { locale: es })}</span>
                    <span>Apertura {activeJornada.hora_apertura?.slice(0, 5)}</span>
                    <span>{activePosCount} POS</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setDetailDrawerJornadaId(activeJornada.id)} className="gap-1">
                  <ArrowRightLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Detalle</span>
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleCloseJornada(activeJornada.id)} className="gap-1">
                  <Square className="w-4 h-4" />
                  Cerrar
                </Button>
              </div>
            </div>
            {/* Mini metrics row */}
            {activeStats && (
              <div className="grid grid-cols-4 gap-2">
                <MiniMetric icon={<DollarSign className="w-3.5 h-3.5" />} label="Ventas" value={formatCLP(activeStats.total_ventas)} />
                <MiniMetric icon={<ShoppingCart className="w-3.5 h-3.5" />} label="Txns" value={String(activeStats.cantidad_ventas)} />
                <MiniMetric icon={<Banknote className="w-3.5 h-3.5" />} label="Efectivo" value={activeSummary ? formatCLP(activeSummary.cash_sales || 0) : "-"} />
                <MiniMetric icon={<CreditCard className="w-3.5 h-3.5" />} label="Tarjeta" value={activeSummary ? formatCLP((activeSummary.sales_by_payment?.card || 0)) : "-"} />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Jornada History (primary content) ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Historial de Jornadas
        </h3>
        <JornadaHistoryTable
          jornadas={jornadas}
          jornadaStats={jornadaStats}
          financialSummaries={financialSummaries}
          actionLoading={actionLoading}
          onCloseJornada={handleCloseJornada}
          onDeleteJornada={deleteJornada}
          onForceClose={(role === "admin" || role === "gerencia") ? (j) => openForceCloseModal(j) : undefined}
          onApproveReview={(role === "admin" || role === "gerencia") ? handleApproveReview : undefined}
          onShowDetail={(id) => setDetailDrawerJornadaId(id)}
          onExportCSV={exportJornadaCSV}
        />
      </div>

      {/* ── Settings (collapsible, bottom) ── */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="gap-2 text-muted-foreground w-full justify-start">
            <Settings className="w-4 h-4" />
            Configuración de Caja
            <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <JornadaCashSettingsCard />
        </CollapsibleContent>
      </Collapsible>

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
      <Dialog open={!!showForceCloseConfirm} onOpenChange={(v) => { if (!v) { setShowForceCloseConfirm(null); setForceCloseReason(""); setShowDoubleConfirm(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Forzar Cierre de Jornada
            </DialogTitle>
            <DialogDescription asChild>
              <div className="pt-2 space-y-4">
                <p>
                  Cerrar forzadamente "<strong>{showForceCloseConfirm?.nombre || `#${showForceCloseConfirm?.numero_jornada}`}</strong>".
                </p>

                {forceCloseDifference !== null && Math.abs(forceCloseDifference) > 0.01 && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm">
                    <p className="font-medium text-destructive mb-1">Diferencia de caja estimada</p>
                    <p className="text-2xl font-bold text-destructive tabular-nums">{formatCLP(Math.abs(forceCloseDifference))}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {forceCloseDifference < 0 ? "Faltante — se generará gasto de ajuste" : "Sobrante — se registrará ingreso extra"}
                    </p>
                  </div>
                )}

                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm space-y-2">
                  <p className="font-medium text-destructive">⚠ Advertencias:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Ajuste contable automático</li>
                    <li>Marcada para revisión administrativa</li>
                    <li>Acción irreversible</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Motivo <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    value={forceCloseReason}
                    onChange={(e) => setForceCloseReason(e.target.value)}
                    placeholder="Mínimo 30 caracteres..."
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">{forceCloseReason.trim().length}/30</p>
                </div>

                {showDoubleConfirm && (
                  <div className="p-3 bg-destructive/20 border border-destructive/50 rounded-lg text-sm">
                    <p className="font-bold text-destructive">
                      ⚠ La diferencia supera $100.000 CLP. ¿Está seguro?
                    </p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowForceCloseConfirm(null); setForceCloseReason(""); setShowDoubleConfirm(false); }} disabled={forceCloseLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleForceClose} disabled={forceCloseLoading || forceCloseReason.trim().length < 30}>
              {forceCloseLoading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cerrando...</>
                : showDoubleConfirm
                  ? <><AlertTriangle className="w-4 h-4 mr-2" />Confirmar cierre forzado</>
                  : <><AlertTriangle className="w-4 h-4 mr-2" />Forzar Cierre</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-2 rounded-lg bg-background border text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <p className="font-bold text-sm tabular-nums">{value}</p>
    </div>
  );
}
