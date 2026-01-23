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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, Download, Store, TrendingUp, TrendingDown, DollarSign, 
  CreditCard, Banknote, ArrowRightLeft, AlertTriangle, CheckCircle,
  QrCode, Clock, XCircle
} from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface JornadaCloseSummaryDialogProps {
  open: boolean;
  onClose: () => void;
  jornadaId: string;
  jornadaNumber?: number;
  jornadaDate?: string;
}

interface FinancialSummary {
  id: string;
  venue_id: string;
  jornada_id: string;
  pos_id: string | null;
  pos_type?: string | null;
  gross_sales_total: number;
  sales_by_payment: { cash?: number; card?: number; transfer?: number };
  transactions_count: number;
  cancelled_sales_total: number;
  cancelled_transactions_count: number;
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
  closed_by: string;
  closed_at: string;
  // Token metrics
  tokens_issued_count: number;
  tokens_redeemed_count: number;
  tokens_pending_count: number;
  tokens_expired_count: number;
  tokens_cancelled_count: number;
}

interface POSTerminal {
  id: string;
  name: string;
}

export function JornadaCloseSummaryDialog({
  open,
  onClose,
  jornadaId,
  jornadaNumber,
  jornadaDate,
}: JornadaCloseSummaryDialogProps) {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<FinancialSummary[]>([]);
  const [posTerminals, setPosTerminals] = useState<Record<string, POSTerminal>>({});
  const [overallSummary, setOverallSummary] = useState<FinancialSummary | null>(null);
  const [posSummaries, setPosSummaries] = useState<FinancialSummary[]>([]);

  useEffect(() => {
    if (open && jornadaId) {
      fetchData();
    }
  }, [open, jornadaId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all summaries for this jornada
      const { data: summaryData, error: summaryError } = await supabase
        .from("jornada_financial_summary")
        .select("*")
        .eq("jornada_id", jornadaId);

      if (summaryError) throw summaryError;

      // Fetch POS terminals for names
      const { data: posData } = await supabase
        .from("pos_terminals")
        .select("id, name");

      const posMap: Record<string, POSTerminal> = {};
      (posData || []).forEach((pos) => {
        posMap[pos.id] = pos;
      });
      setPosTerminals(posMap);

      // Separate overall from per-POS summaries
      const all = (summaryData || []) as FinancialSummary[];
      setSummaries(all);
      
      const overall = all.find((s) => s.pos_id === null);
      const perPos = all.filter((s) => s.pos_id !== null);
      
      setOverallSummary(overall || null);
      setPosSummaries(perPos);
    } catch (error) {
      console.error("Error fetching summary data:", error);
      toast.error("Error al cargar resumen");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!overallSummary) return;

    const rows: string[][] = [
      ["ESTADO DE RESULTADO OPERATIVO - CIERRE DE JORNADA"],
      [`Jornada #${jornadaNumber || "N/A"}`],
      [`Fecha: ${jornadaDate ? format(new Date(jornadaDate), "dd/MM/yyyy", { locale: es }) : "N/A"}`],
      [`Generado: ${format(new Date(overallSummary.closed_at), "dd/MM/yyyy HH:mm", { locale: es })}`],
      [""],
      ["=== RESUMEN GENERAL ==="],
      ["Métrica", "Valor"],
      ["Ventas Brutas", overallSummary.gross_sales_total.toString()],
      ["Transacciones", overallSummary.transactions_count.toString()],
      ["Ventas Canceladas", overallSummary.cancelled_sales_total.toString()],
      ["Ventas Netas", overallSummary.net_sales_total.toString()],
      ["Gastos Totales", overallSummary.expenses_total.toString()],
      ["Resultado Operacional", overallSummary.net_operational_result.toString()],
      [""],
      ["Ventas por Método de Pago"],
      ["Efectivo", (overallSummary.sales_by_payment?.cash || 0).toString()],
      ["Tarjeta", (overallSummary.sales_by_payment?.card || 0).toString()],
      ["Transferencia", (overallSummary.sales_by_payment?.transfer || 0).toString()],
      [""],
      ["Gastos por Tipo"],
      ["Operacionales", (overallSummary.expenses_by_type?.operacional || 0).toString()],
      ["No Operacionales", (overallSummary.expenses_by_type?.no_operacional || 0).toString()],
      [""],
      ["Arqueo de Caja General"],
      ["Efectivo Apertura", overallSummary.opening_cash.toString()],
      ["Ventas Efectivo", overallSummary.cash_sales.toString()],
      ["Gastos Efectivo", overallSummary.cash_expenses.toString()],
      ["Efectivo Esperado", overallSummary.expected_cash.toString()],
      ["Efectivo Contado", overallSummary.counted_cash.toString()],
      ["Diferencia", overallSummary.cash_difference.toString()],
      [""],
      ["=== TOKENS QR (Ley de Entrega) ==="],
      ["Tokens Emitidos", (overallSummary.tokens_issued_count || 0).toString()],
      ["Tokens Canjeados", (overallSummary.tokens_redeemed_count || 0).toString()],
      ["Tokens Pendientes", (overallSummary.tokens_pending_count || 0).toString()],
      ["Tokens Expirados", (overallSummary.tokens_expired_count || 0).toString()],
      ["Tokens Cancelados", (overallSummary.tokens_cancelled_count || 0).toString()],
      [""],
      ["=== DETALLE POR POS ==="],
    ];

    // Add per-POS rows
    posSummaries.forEach((pos) => {
      const posName = posTerminals[pos.pos_id!]?.name || pos.pos_id;
      const posType = pos.pos_type === "alcohol_sales" ? "(Alcohol)" : pos.pos_type === "ticket_sales" ? "(Entradas)" : "";
      rows.push([""], [`--- ${posName} ${posType} ---`]);
      rows.push(["Ventas Brutas", pos.gross_sales_total.toString()]);
      rows.push(["Transacciones", pos.transactions_count.toString()]);
      rows.push(["Ventas Netas", pos.net_sales_total.toString()]);
      rows.push(["Gastos", pos.expenses_total.toString()]);
      rows.push(["Resultado", pos.net_operational_result.toString()]);
      rows.push(["Efectivo Esperado", pos.expected_cash.toString()]);
      rows.push(["Efectivo Contado", pos.counted_cash.toString()]);
      rows.push(["Diferencia", pos.cash_difference.toString()]);
      if (pos.tokens_redeemed_count > 0) {
        rows.push(["Tokens Canjeados", pos.tokens_redeemed_count.toString()]);
      }
    });

    const csv = rows.map((row) => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `estado_resultado_jornada_${jornadaNumber || jornadaId.slice(0, 8)}_${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();
    toast.success("CSV exportado");
  };

  const getPosTypeLabel = (posType?: string | null) => {
    switch (posType) {
      case "alcohol_sales": return "Alcohol";
      case "ticket_sales": return "Entradas";
      default: return null;
    }
  };

  const SummaryCard = ({ summary, title, isPOS = false }: { summary: FinancialSummary; title: string; isPOS?: boolean }) => {
    const hasCashDifference = Math.abs(summary.cash_difference) > 0.01;
    const posTypeLabel = getPosTypeLabel(summary.pos_type);
    const hasPendingTokens = (summary.tokens_pending_count || 0) > 0;
    
    return (
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPOS && <Store className="w-4 h-4 text-primary" />}
            <span className="font-semibold">{title}</span>
            {posTypeLabel && (
              <Badge variant="outline" className="text-xs">
                {posTypeLabel}
              </Badge>
            )}
          </div>
          <Badge variant={summary.net_operational_result >= 0 ? "default" : "destructive"}>
            {summary.net_operational_result >= 0 ? (
              <TrendingUp className="w-3 h-3 mr-1" />
            ) : (
              <TrendingDown className="w-3 h-3 mr-1" />
            )}
            {formatCLP(summary.net_operational_result)}
          </Badge>
        </div>

        {/* Sales Section */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center p-2 bg-green-500/10 rounded">
            <div className="font-medium text-green-600">{formatCLP(summary.gross_sales_total)}</div>
            <div className="text-xs text-muted-foreground">Ventas Brutas</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="font-medium">{summary.transactions_count}</div>
            <div className="text-xs text-muted-foreground">Transacciones</div>
          </div>
          <div className="text-center p-2 bg-destructive/10 rounded">
            <div className="font-medium text-destructive">{formatCLP(summary.cancelled_sales_total)}</div>
            <div className="text-xs text-muted-foreground">Canceladas</div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
            <Banknote className="w-3 h-3" />
            {formatCLP(summary.sales_by_payment?.cash || 0)}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
            <CreditCard className="w-3 h-3" />
            {formatCLP(summary.sales_by_payment?.card || 0)}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded">
            <ArrowRightLeft className="w-3 h-3" />
            {formatCLP(summary.sales_by_payment?.transfer || 0)}
          </div>
        </div>

        {/* Expenses */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-center p-2 bg-orange-500/10 rounded">
            <div className="font-medium text-orange-600">{formatCLP(summary.expenses_by_type?.operacional || 0)}</div>
            <div className="text-xs text-muted-foreground">Gastos Op.</div>
          </div>
          <div className="text-center p-2 bg-red-500/10 rounded">
            <div className="font-medium text-red-600">{formatCLP(summary.expenses_by_type?.no_operacional || 0)}</div>
            <div className="text-xs text-muted-foreground">Gastos No Op.</div>
          </div>
        </div>

        {/* Token Metrics - Only show for overall or if has redeemed tokens */}
        {(!isPOS || (summary.tokens_redeemed_count || 0) > 0) && (summary.tokens_issued_count || 0) > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <QrCode className="w-3 h-3" />
              Tokens QR
            </div>
            <div className="grid grid-cols-5 gap-1 text-xs">
              <div className="text-center p-1 bg-blue-500/10 rounded">
                <div className="font-medium text-blue-600">{summary.tokens_issued_count || 0}</div>
                <div className="text-muted-foreground text-[10px]">Emitidos</div>
              </div>
              <div className="text-center p-1 bg-green-500/10 rounded">
                <div className="font-medium text-green-600">{summary.tokens_redeemed_count || 0}</div>
                <div className="text-muted-foreground text-[10px]">Canjeados</div>
              </div>
              <div className={`text-center p-1 rounded ${hasPendingTokens ? "bg-yellow-500/20" : "bg-muted"}`}>
                <div className={`font-medium ${hasPendingTokens ? "text-yellow-600" : ""}`}>
                  {summary.tokens_pending_count || 0}
                </div>
                <div className="text-muted-foreground text-[10px]">Pendientes</div>
              </div>
              <div className="text-center p-1 bg-muted rounded">
                <div className="font-medium">{summary.tokens_expired_count || 0}</div>
                <div className="text-muted-foreground text-[10px]">Expirados</div>
              </div>
              <div className="text-center p-1 bg-muted rounded">
                <div className="font-medium">{summary.tokens_cancelled_count || 0}</div>
                <div className="text-muted-foreground text-[10px]">Cancelados</div>
              </div>
            </div>
            {hasPendingTokens && !isPOS && (
              <div className="mt-2 flex items-center gap-1 text-xs text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded">
                <Clock className="w-3 h-3" />
                {summary.tokens_pending_count} tokens pendientes de canje
              </div>
            )}
          </div>
        )}

        {/* Cash Reconciliation */}
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground mb-2">Arqueo de Caja</div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="text-center">
              <div className="font-medium">{formatCLP(summary.opening_cash)}</div>
              <div className="text-muted-foreground">Apertura</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-green-600">+{formatCLP(summary.cash_sales)}</div>
              <div className="text-muted-foreground">Ventas</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-orange-600">-{formatCLP(summary.cash_expenses)}</div>
              <div className="text-muted-foreground">Gastos</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-primary">{formatCLP(summary.expected_cash)}</div>
              <div className="text-muted-foreground">Esperado</div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 p-2 rounded bg-muted">
            <div>
              <span className="text-xs text-muted-foreground">Contado: </span>
              <span className="font-medium">{formatCLP(summary.counted_cash)}</span>
            </div>
            <Badge
              variant={hasCashDifference ? "destructive" : "secondary"}
              className={!hasCashDifference ? "bg-green-500 text-white" : ""}
            >
              {hasCashDifference ? (
                <AlertTriangle className="w-3 h-3 mr-1" />
              ) : (
                <CheckCircle className="w-3 h-3 mr-1" />
              )}
              {summary.cash_difference >= 0 ? "+" : ""}
              {formatCLP(summary.cash_difference)}
            </Badge>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Estado de Resultado Operativo - Jornada #{jornadaNumber || "N/A"}
          </DialogTitle>
          <DialogDescription>
            Resumen financiero y de tokens por POS y general
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !overallSummary ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay resumen disponible para esta jornada
          </div>
        ) : (
          <Tabs defaultValue="overall" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overall" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="per-pos" className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                Por POS ({posSummaries.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overall">
              <SummaryCard summary={overallSummary} title="Resumen General" />
            </TabsContent>

            <TabsContent value="per-pos">
              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-4 pr-4">
                  {posSummaries.length > 0 ? (
                    posSummaries.map((pos) => (
                      <SummaryCard
                        key={pos.id}
                        summary={pos}
                        title={posTerminals[pos.pos_id!]?.name || `POS ${pos.pos_id?.slice(0, 8)}`}
                        isPOS
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay datos por POS disponibles
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={exportCSV} disabled={!overallSummary}>
            <Download className="w-4 h-4 mr-2" />
            Descargar CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}