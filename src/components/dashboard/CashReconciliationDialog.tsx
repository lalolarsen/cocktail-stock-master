import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Calculator,
  AlertTriangle,
  CheckCircle,
  Banknote,
  Store,
  ChevronRight,
  ChevronLeft,
  ClipboardCheck,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CashReconciliationDialogProps {
  open: boolean;
  onClose: () => void;
  onReconciled: () => void;
  jornadaId: string;
}

interface POSReconciliationData {
  posId: string;
  posName: string;
  locationName: string;
  openingCash: number;
  cashSalesTotal: number;
  cashExpenses: number;
  expectedCash: number;
  closingCashCounted: string;
  notes: string;
}

interface JornadaSummary {
  grossSales: number;
  netSales: number;
  transactionCount: number;
  cancelledCount: number;
  cancelledTotal: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
}

type WizardStep = "summary" | "arqueo" | "confirm";

export function CashReconciliationDialog({
  open,
  onClose,
  onReconciled,
  jornadaId,
}: CashReconciliationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [posReconciliations, setPosReconciliations] = useState<POSReconciliationData[]>([]);
  const [jornadaSummary, setJornadaSummary] = useState<JornadaSummary>({
    grossSales: 0, netSales: 0, transactionCount: 0, cancelledCount: 0,
    cancelledTotal: 0, cashSales: 0, cardSales: 0, transferSales: 0,
  });
  const [step, setStep] = useState<WizardStep>("summary");
  const [confirmChecks, setConfirmChecks] = useState({ allArqueados: false, entiendoCierre: false });

  useEffect(() => {
    if (open && jornadaId) {
      setStep("summary");
      setConfirmChecks({ allArqueados: false, entiendoCierre: false });
      fetchData();
    }
  }, [open, jornadaId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Parallel fetches
      const [posResult, openingsResult, salesResult, expensesResult] = await Promise.all([
        supabase.from("pos_terminals").select("id, name, location:stock_locations(name)")
          .eq("is_active", true).eq("is_cash_register", true),
        supabase.from("jornada_cash_openings").select("pos_id, opening_cash_amount")
          .eq("jornada_id", jornadaId),
        supabase.from("sales").select("pos_id, total_amount, payment_method, is_cancelled")
          .eq("jornada_id", jornadaId),
        supabase.from("expenses").select("pos_id, amount, payment_method")
          .eq("jornada_id", jornadaId).eq("payment_method", "cash"),
      ]);

      if (posResult.error) throw posResult.error;
      if (salesResult.error) throw salesResult.error;

      const allSales = salesResult.data || [];
      const activeSales = allSales.filter((s: any) => !s.is_cancelled);
      const cancelledSales = allSales.filter((s: any) => s.is_cancelled);

      // Build summary
      let cashSales = 0, cardSales = 0, transferSales = 0;
      activeSales.forEach((s: any) => {
        const amt = Number(s.total_amount);
        if (s.payment_method === "cash") cashSales += amt;
        else if (s.payment_method === "card") cardSales += amt;
        else if (s.payment_method === "transfer") transferSales += amt;
      });

      setJornadaSummary({
        grossSales: activeSales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
        netSales: activeSales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
        transactionCount: activeSales.length,
        cancelledCount: cancelledSales.length,
        cancelledTotal: cancelledSales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
        cashSales, cardSales, transferSales,
      });

      // Build per-POS data
      const openingsMap: Record<string, number> = {};
      (openingsResult.data || []).forEach((o: any) => { openingsMap[o.pos_id] = Number(o.opening_cash_amount); });

      const cashSalesByPos: Record<string, number> = {};
      activeSales.filter((s: any) => s.payment_method === "cash").forEach((s: any) => {
        const pid = s.pos_id || "unknown";
        cashSalesByPos[pid] = (cashSalesByPos[pid] || 0) + Number(s.total_amount);
      });

      const cashExpensesByPos: Record<string, number> = {};
      (expensesResult.data || []).forEach((e: any) => {
        const pid = e.pos_id || "unknown";
        cashExpensesByPos[pid] = (cashExpensesByPos[pid] || 0) + Number(e.amount);
      });

      const reconciliationData: POSReconciliationData[] = (posResult.data || []).map((pos: any) => {
        const openingCash = openingsMap[pos.id] || 0;
        const posCashSales = cashSalesByPos[pos.id] || 0;
        const posCashExpenses = cashExpensesByPos[pos.id] || 0;
        return {
          posId: pos.id,
          posName: pos.name,
          locationName: pos.location?.name || "Sin ubicación",
          openingCash,
          cashSalesTotal: posCashSales,
          cashExpenses: posCashExpenses,
          expectedCash: openingCash + posCashSales - posCashExpenses,
          closingCashCounted: "",
          notes: "",
        };
      });

      setPosReconciliations(reconciliationData);
    } catch (error) {
      console.error("Error fetching reconciliation data:", error);
      toast.error("Error al cargar datos de caja");
    } finally {
      setLoading(false);
    }
  };

  const updatePosField = (posId: string, field: "closingCashCounted" | "notes", value: string) => {
    setPosReconciliations((prev) =>
      prev.map((pos) => pos.posId === posId ? { ...pos, [field]: value } : pos)
    );
  };

  const calculateDifference = (pos: POSReconciliationData): number => {
    const closing = parseFloat(pos.closingCashCounted) || 0;
    return closing - pos.expectedCash;
  };

  const allPosHaveClosingCash = (): boolean =>
    posReconciliations.every((pos) => pos.closingCashCounted !== "" && parseFloat(pos.closingCashCounted) >= 0);

  const allDifferencesJustified = (): boolean =>
    posReconciliations.every((pos) => {
      if (pos.closingCashCounted === "") return false;
      const diff = calculateDifference(pos);
      if (Math.abs(diff) > 0.01) return pos.notes.trim().length > 0;
      return true;
    });

  const canProceedFromArqueo = allPosHaveClosingCash() && allDifferencesJustified();

  const handleSubmit = async () => {
    if (!canProceedFromArqueo) {
      toast.error("Completa el arqueo de todas las cajas");
      return;
    }

    setSubmitting(true);
    try {
      const cashClosings = posReconciliations.map((pos) => ({
        pos_id: pos.posId,
        closing_cash_counted: parseFloat(pos.closingCashCounted) || 0,
        notes: pos.notes || null,
      }));

      const { data, error } = await supabase.rpc("close_jornada_manual", {
        p_jornada_id: jornadaId,
        p_cash_closings: cashClosings,
      });

      if (error) throw new Error(error.message || "Error al cerrar jornada");

      const result = data as { success: boolean; error?: string; failing_step?: string };
      if (!result?.success) {
        throw new Error(result?.error || "Error desconocido al cerrar jornada");
      }

      toast.success("Jornada cerrada exitosamente");
      onReconciled();
    } catch (error: any) {
      console.error("Error closing jornada:", error);
      toast.error(error.message || "Error al cerrar jornada");
    } finally {
      setSubmitting(false);
    }
  };

  const getTotalSummary = () => {
    const totalExpected = posReconciliations.reduce((sum, pos) => sum + pos.expectedCash, 0);
    const totalCounted = posReconciliations.reduce((sum, pos) => sum + (parseFloat(pos.closingCashCounted) || 0), 0);
    return { totalExpected, totalCounted, totalDifference: totalCounted - totalExpected };
  };

  const { totalExpected, totalCounted, totalDifference } = getTotalSummary();
  const hasTotalDifference = Math.abs(totalDifference) > 0.01;
  const posWithDifferences = posReconciliations.filter(
    (pos) => pos.closingCashCounted !== "" && Math.abs(calculateDifference(pos)) > 0.01
  );

  // ── Step renderers ──

  const renderSummary = () => (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Ventas brutas" value={formatCLP(jornadaSummary.grossSales)} />
        <SummaryCard label="Transacciones" value={String(jornadaSummary.transactionCount)} />
        <SummaryCard label="Cancelaciones" value={`${jornadaSummary.cancelledCount} (${formatCLP(jornadaSummary.cancelledTotal)})`} negative={jornadaSummary.cancelledCount > 0} />
        <SummaryCard label="Ventas netas" value={formatCLP(jornadaSummary.netSales)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Efectivo" value={formatCLP(jornadaSummary.cashSales)} small />
        <SummaryCard label="Tarjeta" value={formatCLP(jornadaSummary.cardSales)} small />
        <SummaryCard label="Transferencia" value={formatCLP(jornadaSummary.transferSales)} small />
      </div>
    </div>
  );

  const renderArqueo = () => (
    <ScrollArea className="h-[50vh] pr-4">
      <div className="space-y-4">
        {posReconciliations.map((pos) => {
          const difference = calculateDifference(pos);
          const hasDifference = pos.closingCashCounted !== "" && Math.abs(difference) > 0.01;
          const missingNotes = hasDifference && pos.notes.trim().length === 0;

          return (
            <Card key={pos.posId} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Store className="w-4 h-4 text-primary" />
                <span className="font-semibold">{pos.posName}</span>
                <Badge variant="outline" className="ml-auto">{pos.locationName}</Badge>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3">
                <MiniStat label="Apertura" value={formatCLP(pos.openingCash)} />
                <MiniStat label="Ventas $" value={`+${formatCLP(pos.cashSalesTotal)}`} className="text-green-600" />
                <MiniStat label="Retiros $" value={`-${formatCLP(pos.cashExpenses)}`} className="text-red-600" />
                <MiniStat label="Esperado" value={formatCLP(pos.expectedCash)} className="font-bold text-primary" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`closing-${pos.posId}`} className="text-sm flex items-center gap-1">
                      <Banknote className="w-3 h-3" />
                      Efectivo contado
                    </Label>
                    <Input
                      id={`closing-${pos.posId}`}
                      type="number"
                      placeholder="0"
                      value={pos.closingCashCounted}
                      onChange={(e) => updatePosField(pos.posId, "closingCashCounted", e.target.value)}
                      min="0"
                      step="1"
                      className="mt-1"
                    />
                  </div>
                  {pos.closingCashCounted !== "" && (
                    <div className="flex-shrink-0 pt-5">
                      <Badge
                        variant={hasDifference ? "destructive" : "secondary"}
                        className={!hasDifference ? "bg-green-500 text-white" : ""}
                      >
                        {hasDifference ? <AlertTriangle className="w-3 h-3 mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                        {difference >= 0 ? "+" : ""}{formatCLP(difference)}
                      </Badge>
                    </div>
                  )}
                </div>

                {hasDifference && (
                  <div>
                    <Textarea
                      placeholder="Justificación de la diferencia (obligatorio)..."
                      value={pos.notes}
                      onChange={(e) => updatePosField(pos.posId, "notes", e.target.value)}
                      className={`text-sm ${missingNotes ? "border-destructive" : ""}`}
                      rows={2}
                    />
                    {missingNotes && (
                      <p className="text-xs text-destructive mt-1">
                        Debes justificar la diferencia para continuar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );

  const renderConfirm = () => (
    <div className="space-y-4 py-2">
      {/* Totals recap */}
      <Card className={`p-4 ${hasTotalDifference ? "bg-destructive/10 border-destructive/30" : "bg-green-500/10 border-green-500/30"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Total General</p>
            <p className="text-xs text-muted-foreground">
              Esperado: {formatCLP(totalExpected)} | Contado: {formatCLP(totalCounted)}
            </p>
          </div>
          <Badge variant={hasTotalDifference ? "destructive" : "secondary"} className={!hasTotalDifference ? "bg-green-500 text-white" : ""}>
            {hasTotalDifference ? <AlertTriangle className="w-3 h-3 mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
            {totalDifference >= 0 ? "+" : ""}{formatCLP(totalDifference)}
          </Badge>
        </div>
      </Card>

      {/* Differences detail */}
      {posWithDifferences.length > 0 && (
        <Card className="p-4 bg-amber-500/5 border-amber-500/20">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            {posWithDifferences.length} POS con diferencia
          </p>
          <div className="space-y-1 text-sm">
            {posWithDifferences.map((pos) => (
              <div key={pos.posId} className="flex justify-between text-muted-foreground">
                <span>{pos.posName}</span>
                <span>{formatCLP(calculateDifference(pos))}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Checklist */}
      <div className="space-y-3 pt-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="check-arqueados"
            checked={confirmChecks.allArqueados}
            onCheckedChange={(v) => setConfirmChecks((p) => ({ ...p, allArqueados: !!v }))}
          />
          <Label htmlFor="check-arqueados" className="text-sm leading-tight cursor-pointer">
            Todos los POS han sido arqueados y las diferencias están justificadas.
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="check-entiendo"
            checked={confirmChecks.entiendoCierre}
            onCheckedChange={(v) => setConfirmChecks((p) => ({ ...p, entiendoCierre: !!v }))}
          />
          <Label htmlFor="check-entiendo" className="text-sm leading-tight cursor-pointer">
            Entiendo que esto cerrará la jornada y bloqueará ventas hasta la próxima apertura.
          </Label>
        </div>
      </div>
    </div>
  );

  const stepConfig: Record<WizardStep, { title: string; desc: string; icon: React.ReactNode }> = {
    summary: { title: "Resumen de Jornada", desc: "Revisa los resultados antes de cerrar", icon: <BarChart3 className="w-5 h-5" /> },
    arqueo: { title: "Arqueo por POS", desc: "Ingresa el efectivo contado en cada caja", icon: <Calculator className="w-5 h-5" /> },
    confirm: { title: "Confirmación", desc: "Verifica y confirma el cierre de jornada", icon: <ShieldCheck className="w-5 h-5" /> },
  };

  const steps: WizardStep[] = ["summary", "arqueo", "confirm"];
  const currentStepIndex = steps.indexOf(step);
  const currentConfig = stepConfig[step];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentConfig.icon}
            {currentConfig.title}
          </DialogTitle>
          <DialogDescription>{currentConfig.desc}</DialogDescription>
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < currentStepIndex ? "bg-primary text-primary-foreground"
                    : i === currentStepIndex ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i < currentStepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < currentStepIndex ? "bg-primary" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            {step === "summary" && renderSummary()}
            {step === "arqueo" && renderArqueo()}
            {step === "confirm" && renderConfirm()}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          {currentStepIndex > 0 && (
            <Button variant="outline" onClick={() => setStep(steps[currentStepIndex - 1])} disabled={submitting}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Atrás
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {step === "summary" && (
            <Button onClick={() => setStep("arqueo")}>
              Siguiente
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === "arqueo" && (
            <Button onClick={() => setStep("confirm")} disabled={!canProceedFromArqueo}>
              Siguiente
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === "confirm" && (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !confirmChecks.allArqueados || !confirmChecks.entiendoCierre}
              variant="destructive"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cerrando...
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4 mr-1" />
                  Cerrar Jornada
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reusable sub-components ──

function SummaryCard({ label, value, negative, small }: { label: string; value: string; negative?: boolean; small?: boolean }) {
  return (
    <div className={`p-3 rounded-lg bg-muted text-center ${small ? "p-2" : ""}`}>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`font-bold ${small ? "text-sm" : "text-lg"} ${negative ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="text-center p-2 bg-muted rounded">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${className || ""}`}>{value}</div>
    </div>
  );
}
