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
import { Loader2, Calculator, AlertTriangle, CheckCircle, Banknote, Store } from "lucide-react";
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
  expectedCash: number;
  closingCashCounted: string;
  notes: string;
}

export function CashReconciliationDialog({
  open,
  onClose,
  onReconciled,
  jornadaId,
}: CashReconciliationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [posReconciliations, setPosReconciliations] = useState<POSReconciliationData[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);

  useEffect(() => {
    if (open && jornadaId) {
      fetchData();
    }
  }, [open, jornadaId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get current user's venue_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user.id)
        .single();

      const currentVenueId = profile?.venue_id;
      setVenueId(currentVenueId);

      // Get all active POS terminals
      const { data: posTerminals, error: posError } = await supabase
        .from("pos_terminals")
        .select(`
          id,
          name,
          location:stock_locations(name)
        `)
        .eq("is_active", true);

      if (posError) throw posError;

      // Get opening cash amounts per POS for this jornada
      const { data: cashOpenings, error: openingsError } = await supabase
        .from("jornada_cash_openings")
        .select("pos_id, opening_cash_amount")
        .eq("jornada_id", jornadaId);

      if (openingsError) throw openingsError;

      // Get existing closings if any (for edit scenarios)
      const { data: existingClosings, error: closingsError } = await supabase
        .from("jornada_cash_closings")
        .select("*")
        .eq("jornada_id", jornadaId);

      if (closingsError) throw closingsError;

      // Get all cash sales for this jornada grouped by POS
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("pos_id, total_amount, payment_method")
        .eq("jornada_id", jornadaId)
        .eq("is_cancelled", false)
        .eq("payment_method", "cash");

      if (salesError) throw salesError;

      // Build sales totals per POS
      const salesByPos: Record<string, number> = {};
      (sales || []).forEach((sale: any) => {
        const posId = sale.pos_id || "unknown";
        salesByPos[posId] = (salesByPos[posId] || 0) + Number(sale.total_amount);
      });

      // Build opening amounts map
      const openingsMap: Record<string, number> = {};
      (cashOpenings || []).forEach((opening: any) => {
        openingsMap[opening.pos_id] = Number(opening.opening_cash_amount);
      });

      // Build existing closings map
      const existingClosingsMap: Record<string, any> = {};
      (existingClosings || []).forEach((closing: any) => {
        existingClosingsMap[closing.pos_id] = closing;
      });

      // Build reconciliation data for each POS
      const reconciliationData: POSReconciliationData[] = (posTerminals || []).map((pos: any) => {
        const openingCash = openingsMap[pos.id] || 0;
        const cashSalesTotal = salesByPos[pos.id] || 0;
        const expectedCash = openingCash + cashSalesTotal;
        const existing = existingClosingsMap[pos.id];

        return {
          posId: pos.id,
          posName: pos.name,
          locationName: pos.location?.name || "Sin ubicación",
          openingCash,
          cashSalesTotal,
          expectedCash,
          closingCashCounted: existing?.closing_cash_counted?.toString() || "",
          notes: existing?.notes || "",
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
      prev.map((pos) =>
        pos.posId === posId ? { ...pos, [field]: value } : pos
      )
    );
  };

  const calculateDifference = (pos: POSReconciliationData): number => {
    const closing = parseFloat(pos.closingCashCounted) || 0;
    return closing - pos.expectedCash;
  };

  const allPosHaveClosingCash = (): boolean => {
    return posReconciliations.every(
      (pos) => pos.closingCashCounted !== "" && parseFloat(pos.closingCashCounted) >= 0
    );
  };

  const handleSubmit = async () => {
    if (!allPosHaveClosingCash()) {
      toast.error("Ingresa el monto de cierre para cada caja");
      return;
    }

    setSubmitting(true);
    try {
      // Prepare cash closings data for RPC
      const cashClosings = posReconciliations.map((pos) => ({
        pos_id: pos.posId,
        closing_cash_counted: parseFloat(pos.closingCashCounted) || 0,
        notes: pos.notes || null,
      }));

      // Call the atomic close_jornada_manual RPC function
      // This handles: save arqueo, update jornada status, generate summaries, log audit
      const { data, error } = await supabase.rpc("close_jornada_manual", {
        p_jornada_id: jornadaId,
        p_cash_closings: cashClosings,
      });

      if (error) {
        console.error("RPC error:", error);
        throw new Error(error.message || "Error al cerrar jornada");
      }

      // Check RPC response for success
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || "Error desconocido al cerrar jornada");
      }

      toast.success("Jornada cerrada exitosamente");
      onReconciled();
    } catch (error: any) {
      console.error("Error closing jornada:", error);
      toast.error(error.message || "Error al cerrar jornada. No se guardaron cambios.");
    } finally {
      setSubmitting(false);
    }
  };

  const getTotalSummary = () => {
    const totalExpected = posReconciliations.reduce((sum, pos) => sum + pos.expectedCash, 0);
    const totalCounted = posReconciliations.reduce(
      (sum, pos) => sum + (parseFloat(pos.closingCashCounted) || 0),
      0
    );
    const totalDifference = totalCounted - totalExpected;
    return { totalExpected, totalCounted, totalDifference };
  };

  const { totalExpected, totalCounted, totalDifference } = getTotalSummary();
  const hasTotalDifference = Math.abs(totalDifference) > 0.01;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Arqueo de Caja por POS
          </DialogTitle>
          <DialogDescription>
            Ingresa el efectivo contado en cada caja para cerrar la jornada
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : posReconciliations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay cajas activas configuradas
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4">
              {posReconciliations.map((pos) => {
                const difference = calculateDifference(pos);
                const hasDifference = pos.closingCashCounted !== "" && Math.abs(difference) > 0.01;

                return (
                  <Card key={pos.posId} className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Store className="w-4 h-4 text-primary" />
                      <span className="font-semibold">{pos.posName}</span>
                      <Badge variant="outline" className="ml-auto">
                        {pos.locationName}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center p-2 bg-muted rounded">
                        <div className="text-xs text-muted-foreground">Apertura</div>
                        <div className="font-medium">{formatCLP(pos.openingCash)}</div>
                      </div>
                      <div className="text-center p-2 bg-green-500/10 rounded">
                        <div className="text-xs text-muted-foreground">Ventas Efectivo</div>
                        <div className="font-medium text-green-600">+{formatCLP(pos.cashSalesTotal)}</div>
                      </div>
                      <div className="text-center p-2 bg-primary/10 rounded">
                        <div className="text-xs text-muted-foreground">Esperado</div>
                        <div className="font-bold text-primary">{formatCLP(pos.expectedCash)}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label htmlFor={`closing-${pos.posId}`} className="text-sm flex items-center gap-1">
                            <Banknote className="w-3 h-3" />
                            Efectivo Contado
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
                              {hasDifference ? (
                                <AlertTriangle className="w-3 h-3 mr-1" />
                              ) : (
                                <CheckCircle className="w-3 h-3 mr-1" />
                              )}
                              {difference >= 0 ? "+" : ""}
                              {formatCLP(difference)}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {hasDifference && (
                        <Textarea
                          placeholder="Notas sobre la diferencia..."
                          value={pos.notes}
                          onChange={(e) => updatePosField(pos.posId, "notes", e.target.value)}
                          className="text-sm"
                          rows={2}
                        />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Total Summary */}
        {!loading && posReconciliations.length > 0 && (
          <Card
            className={`p-3 mt-2 ${
              allPosHaveClosingCash()
                ? hasTotalDifference
                  ? "bg-destructive/10 border-destructive/30"
                  : "bg-green-500/10 border-green-500/30"
                : "bg-muted"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Total General</div>
                <div className="text-xs text-muted-foreground">
                  Esperado: {formatCLP(totalExpected)} | Contado: {formatCLP(totalCounted)}
                </div>
              </div>
              {allPosHaveClosingCash() && (
                <Badge
                  variant={hasTotalDifference ? "destructive" : "secondary"}
                  className={!hasTotalDifference ? "bg-green-500 text-white" : ""}
                >
                  {hasTotalDifference ? (
                    <AlertTriangle className="w-3 h-3 mr-1" />
                  ) : (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  )}
                  {totalDifference >= 0 ? "+" : ""}
                  {formatCLP(totalDifference)}
                </Badge>
              )}
            </div>
          </Card>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || submitting || !allPosHaveClosingCash()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Confirmar y Cerrar Jornada"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
