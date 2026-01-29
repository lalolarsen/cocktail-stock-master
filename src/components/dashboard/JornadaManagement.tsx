import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Settings
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";
import { JornadaCashOpeningDialog } from "./JornadaCashOpeningDialog";
import { JornadaCashSettingsCard } from "./JornadaCashSettingsCard";
import { CashReconciliationDialog } from "./CashReconciliationDialog";
import { JornadaCloseSummaryDialog } from "./JornadaCloseSummaryDialog";
import { formatCLP } from "@/lib/currency";
import { logAuditEvent } from "@/lib/monitoring";
import { ActiveJornadaCard } from "./jornada/ActiveJornadaCard";
import { JornadaHistoryTable } from "./jornada/JornadaHistoryTable";
import { LiveJornadaStats } from "./jornada/LiveJornadaStats";

const STALE_JORNADA_THRESHOLD_HOURS = 24;

interface Jornada {
  id: string;
  numero_jornada: number;
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
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [jornadaStats, setJornadaStats] = useState<Record<string, JornadaStats>>({});
  const [financialSummaries, setFinancialSummaries] = useState<Record<string, FinancialSummary>>({});
  const [loading, setLoading] = useState(true);
  const [showCashOpening, setShowCashOpening] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState<{ jornadaId: string; numero: number; fecha: string } | null>(null);
  const [expandedJornada, setExpandedJornada] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeJornada, setActiveJornada] = useState<Jornada | null>(null);
  const [showForceCloseConfirm, setShowForceCloseConfirm] = useState<Jornada | null>(null);
  const [forceCloseLoading, setForceCloseLoading] = useState(false);

  useEffect(() => {
    fetchJornadas();
    
    const channel = supabase
      .channel("jornada-management")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jornadas" },
        () => fetchJornadas()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
        await Promise.all([
          fetchJornadaStats(ids),
          fetchFinancialSummaries(ids),
        ]);
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
      (data || []).forEach((s) => {
        summaries[s.jornada_id] = s as unknown as FinancialSummary;
      });
      setFinancialSummaries(summaries);
    } catch (error) {
      console.error("Error fetching financial summaries:", error);
    }
  };

  const fetchJornadaStats = async (jornadaIds: string[]) => {
    try {
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          id,
          jornada_id,
          total_amount,
          is_cancelled,
          sale_items(quantity)
        `)
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
            sum + (s.sale_items?.reduce((itemSum: number, item: { quantity: number }) => itemSum + item.quantity, 0) || 0), 0
          ),
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
      if (!user) {
        toast.error("Debe iniciar sesión para realizar esta acción");
        return;
      }

      const { data: jornadaData } = await supabase
        .from("jornadas")
        .select("venue_id")
        .eq("id", showForceCloseConfirm.id)
        .single();

      const { error: updateError } = await supabase
        .from("jornadas")
        .update({
          estado: "cerrada",
          hora_cierre: format(new Date(), "HH:mm:ss"),
          updated_at: new Date().toISOString(),
        })
        .eq("id", showForceCloseConfirm.id);

      if (updateError) throw updateError;

      await supabase.from("jornada_audit_log").insert({
        jornada_id: showForceCloseConfirm.id,
        venue_id: jornadaData?.venue_id || null,
        actor_user_id: user.id,
        actor_source: "ui",
        action: "forced_close",
        reason: `Jornada forzadamente cerrada por admin - abierta por más de ${STALE_JORNADA_THRESHOLD_HOURS} horas`,
        meta: {
          arqueo_skipped: true,
          jornada_numero: showForceCloseConfirm.numero_jornada,
          fecha: showForceCloseConfirm.fecha,
          hora_apertura: showForceCloseConfirm.hora_apertura,
        },
      });

      await logAuditEvent({
        action: "jornada_forced_close",
        status: "success",
        metadata: {
          jornada_id: showForceCloseConfirm.id,
          jornada_numero: showForceCloseConfirm.numero_jornada,
        },
      });

      toast.success("Jornada cerrada forzosamente. El arqueo fue omitido.");
      setShowForceCloseConfirm(null);
      fetchJornadas();
    } catch (error) {
      console.error("Error force closing jornada:", error);
      toast.error("Error al forzar cierre de jornada");
      
      await logAuditEvent({
        action: "jornada_forced_close",
        status: "fail",
        metadata: {
          jornada_id: showForceCloseConfirm.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      setForceCloseLoading(false);
    }
  };

  const handleCloseJornada = (jornadaId: string) => {
    setShowReconciliation(jornadaId);
  };

  const handleReconciliationComplete = () => {
    setShowReconciliation(null);
    toast.success("Jornada cerrada exitosamente");
    fetchJornadas();
  };

  const deleteJornada = async (jornadaId: string) => {
    const stats = jornadaStats[jornadaId];
    if (stats && stats.cantidad_ventas > 0) {
      toast.error("No se puede eliminar una jornada con ventas registradas");
      return;
    }

    const jornada = jornadas.find(j => j.id === jornadaId);
    if (jornada?.estado === "activa") {
      toast.error("No se puede eliminar una jornada abierta");
      return;
    }

    setActionLoading(jornadaId);
    try {
      const { error } = await supabase
        .from("jornadas")
        .delete()
        .eq("id", jornadaId);

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
    if (!summary) {
      toast.error("No hay resumen financiero disponible");
      return;
    }

    const rows = [
      ["Cierre de Jornada"],
      [`Jornada #${jornada.numero_jornada}`],
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
    link.download = `cierre_jornada_${jornada.id.slice(0, 8)}.csv`;
    link.click();
    toast.success("CSV exportado");
  };

  const handleToggleExpand = (jornadaId: string) => {
    setExpandedJornada(prev => prev === jornadaId ? null : jornadaId);
  };

  const handleShowSummary = (jornadaId: string, numero: number, fecha: string) => {
    setShowSummary({ jornadaId, numero, fecha });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Gestión de Jornadas</h2>
            <p className="text-sm text-muted-foreground">
              Control de turnos y resultados operacionales
            </p>
          </div>
        </div>
      </div>

      {/* Active Jornada Card */}
      <ActiveJornadaCard
        jornada={activeJornada}
        onOpenJornada={handleOpenJornada}
        onCloseJornada={handleCloseJornada}
        onForceClose={(j) => setShowForceCloseConfirm(j)}
      />

      {/* Main Content Tabs */}
      <Tabs defaultValue={activeJornada ? "live" : "history"} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="live" className="gap-2" disabled={!activeJornada}>
            <BarChart3 className="w-4 h-4" />
            Resultados en Vivo
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

        {/* Live Results Tab */}
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

        {/* History Tab */}
        <TabsContent value="history">
          <JornadaHistoryTable
            jornadas={jornadas}
            jornadaStats={jornadaStats}
            financialSummaries={financialSummaries}
            expandedJornada={expandedJornada}
            actionLoading={actionLoading}
            onToggleExpand={handleToggleExpand}
            onCloseJornada={handleCloseJornada}
            onDeleteJornada={deleteJornada}
            onForceClose={(j) => setShowForceCloseConfirm(j)}
            onShowSummary={handleShowSummary}
            onExportCSV={exportJornadaCSV}
          />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <JornadaCashSettingsCard />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
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

      {showSummary && (
        <JornadaCloseSummaryDialog
          open={true}
          onClose={() => setShowSummary(null)}
          jornadaId={showSummary.jornadaId}
          jornadaNumber={showSummary.numero}
          jornadaDate={showSummary.fecha}
        />
      )}

      {/* Force Close Confirmation Dialog */}
      <Dialog open={!!showForceCloseConfirm} onOpenChange={() => setShowForceCloseConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Forzar Cierre de Jornada
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <p>
                Esta acción cerrará la <strong>Jornada #{showForceCloseConfirm?.numero_jornada}</strong> de forma forzada.
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">⚠️ Advertencias:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>El arqueo de caja será <strong>omitido</strong></li>
                  <li>No se generará resumen financiero automático</li>
                  <li>Esta acción es <strong>irreversible</strong></li>
                  <li>Se registrará en el log de auditoría</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                Use esta opción solo para recuperar jornadas obsoletas.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowForceCloseConfirm(null)}
              disabled={forceCloseLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceClose}
              disabled={forceCloseLoading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {forceCloseLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cerrando...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Confirmar Cierre Forzado
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
