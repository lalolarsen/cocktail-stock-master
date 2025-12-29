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
import { Loader2, Calculator, AlertTriangle, CheckCircle, Banknote } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { toast } from "sonner";

interface CashReconciliationDialogProps {
  open: boolean;
  onClose: () => void;
  onReconciled: () => void;
  jornadaId: string;
}

export function CashReconciliationDialog({
  open,
  onClose,
  onReconciled,
  jornadaId,
}: CashReconciliationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [closingCash, setClosingCash] = useState<string>("");
  const [expectedCash, setExpectedCash] = useState<number>(0);
  const [cashSalesTotal, setCashSalesTotal] = useState<number>(0);
  const [existingReconciliation, setExistingReconciliation] = useState<any>(null);

  useEffect(() => {
    if (open && jornadaId) {
      fetchData();
    }
  }, [open, jornadaId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Check for existing cash register record
      const { data: existing, error: existingError } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("jornada_id", jornadaId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        setExistingReconciliation(existing);
        setOpeningCash(existing.opening_cash || 0);
        if (existing.closing_cash !== null) {
          setClosingCash(existing.closing_cash.toString());
        }
      }

      // Calculate cash sales for this jornada
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("total_amount, payment_method")
        .eq("jornada_id", jornadaId)
        .eq("is_cancelled", false);

      if (salesError) throw salesError;

      const cashTotal = (sales || [])
        .filter((s: any) => s.payment_method === "cash")
        .reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

      setCashSalesTotal(cashTotal);
      
      const opening = existing?.opening_cash || 0;
      setOpeningCash(opening);
      setExpectedCash(opening + cashTotal);
    } catch (error) {
      console.error("Error fetching reconciliation data:", error);
      toast.error("Error al cargar datos de caja");
    } finally {
      setLoading(false);
    }
  };

  const calculateDifference = (): number => {
    const closing = parseFloat(closingCash) || 0;
    return closing - expectedCash;
  };

  const handleSubmit = async () => {
    if (!closingCash || parseFloat(closingCash) < 0) {
      toast.error("Ingresa un monto de cierre válido");
      return;
    }

    setSubmitting(true);
    try {
      const closing = parseFloat(closingCash);
      const difference = closing - expectedCash;

      if (existingReconciliation) {
        // Update existing record
        const { error } = await supabase
          .from("cash_registers")
          .update({
            closing_cash: closing,
            expected_cash: expectedCash,
            difference: difference,
          })
          .eq("id", existingReconciliation.id);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from("cash_registers")
          .insert({
            jornada_id: jornadaId,
            opening_cash: openingCash,
            closing_cash: closing,
            expected_cash: expectedCash,
            difference: difference,
          });

        if (error) throw error;
      }

      toast.success("Arqueo de caja registrado");
      onReconciled();
    } catch (error) {
      console.error("Error saving reconciliation:", error);
      toast.error("Error al guardar arqueo");
    } finally {
      setSubmitting(false);
    }
  };

  const difference = calculateDifference();
  const hasDifference = Math.abs(difference) > 0.01;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Arqueo de Caja
          </DialogTitle>
          <DialogDescription>
            Ingresa el efectivo en caja para cerrar la jornada
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="text-sm text-muted-foreground">Apertura</div>
                <div className="text-lg font-semibold">{formatCLP(openingCash)}</div>
              </Card>
              <Card className="p-3">
                <div className="text-sm text-muted-foreground">Ventas Efectivo</div>
                <div className="text-lg font-semibold text-green-600">
                  +{formatCLP(cashSalesTotal)}
                </div>
              </Card>
            </div>

            <Card className="p-3 bg-primary/5 border-primary/20">
              <div className="text-sm text-muted-foreground">Efectivo Esperado</div>
              <div className="text-xl font-bold text-primary">
                {formatCLP(expectedCash)}
              </div>
            </Card>

            {/* Closing Cash Input */}
            <div className="space-y-2">
              <Label htmlFor="closing-cash" className="flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                Efectivo en Caja (Cierre)
              </Label>
              <Input
                id="closing-cash"
                type="number"
                placeholder="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                min="0"
                step="1"
              />
            </div>

            {/* Difference Display */}
            {closingCash && (
              <Card
                className={`p-3 ${
                  hasDifference
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-green-500/10 border-green-500/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hasDifference ? (
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    <span className="text-sm font-medium">Diferencia</span>
                  </div>
                  <Badge
                    variant={hasDifference ? "destructive" : "secondary"}
                    className={!hasDifference ? "bg-green-500 text-white" : ""}
                  >
                    {difference >= 0 ? "+" : ""}
                    {formatCLP(difference)}
                  </Badge>
                </div>
                {hasDifference && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {difference > 0 ? "Sobrante" : "Faltante"} detectado en caja
                  </p>
                )}
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || submitting || !closingCash}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Confirmar y Cerrar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}