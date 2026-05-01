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
  Store,
  ClipboardCheck,
  ShieldCheck,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CashReconciliationDialogProps {
  open: boolean;
  onClose: () => void;
  onReconciled: () => void;
  jornadaId: string;
}

interface POSChecklistItem {
  posId: string;
  posName: string;
  locationName: string;
  bartenderName: string;
  confirmed: boolean;
  notes: string;
  openingCash: number;
  cashAlcohol: number;
  cashTickets: number;
  expectedCash: number;
  countedCashStr: string; // user input
}

export function CashReconciliationDialog({
  open,
  onClose,
  onReconciled,
  jornadaId,
}: CashReconciliationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<POSChecklistItem[]>([]);

  useEffect(() => {
    if (open && jornadaId) {
      fetchData();
    }
  }, [open, jornadaId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [posResult, locationsResult, openingsResult, salesResult, ticketsResult] = await Promise.all([
        supabase
          .from("pos_terminals")
          .select("id, name, location_id")
          .eq("is_active", true)
          .eq("is_cash_register", true),
        supabase.from("stock_locations").select("id, name"),
        supabase.from("jornada_cash_openings").select("pos_id, opening_cash_amount").eq("jornada_id", jornadaId),
        supabase.from("sales").select("pos_id, total_amount").eq("jornada_id", jornadaId).eq("payment_method", "cash").eq("is_cancelled", false),
        supabase.from("ticket_sales").select("pos_id, total").eq("jornada_id", jornadaId).eq("payment_method", "cash").eq("payment_status", "paid"),
      ]);

      if (posResult.error) throw posResult.error;

      const locationMap: Record<string, string> = {};
      (locationsResult.data || []).forEach((loc: any) => {
        locationMap[loc.id] = loc.name;
      });

      const openingMap = new Map<string, number>();
      (openingsResult.data || []).forEach((o: any) => openingMap.set(o.pos_id, Number(o.opening_cash_amount) || 0));

      const alcoholMap = new Map<string, number>();
      (salesResult.data || []).forEach((s: any) => {
        alcoholMap.set(s.pos_id, (alcoholMap.get(s.pos_id) || 0) + (Number(s.total_amount) || 0));
      });
      const ticketsMap = new Map<string, number>();
      (ticketsResult.data || []).forEach((t: any) => {
        ticketsMap.set(t.pos_id, (ticketsMap.get(t.pos_id) || 0) + (Number(t.total) || 0));
      });

      const list: POSChecklistItem[] = (posResult.data || []).map((pos: any) => {
        const opening = openingMap.get(pos.id) || 0;
        const alc = alcoholMap.get(pos.id) || 0;
        const tk = ticketsMap.get(pos.id) || 0;
        return {
          posId: pos.id,
          posName: pos.name,
          locationName: locationMap[pos.location_id] || "Sin ubicación",
          bartenderName: "",
          confirmed: false,
          notes: "",
          openingCash: opening,
          cashAlcohol: alc,
          cashTickets: tk,
          expectedCash: Math.round(opening + alc + tk),
          countedCashStr: "",
        };
      });

      setItems(list);
    } catch (error) {
      console.error("Error loading POS list:", error);
      toast.error("Error al cargar lista de POS");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (
    posId: string,
    field: keyof Omit<POSChecklistItem, "posId" | "posName" | "locationName">,
    value: string | boolean,
  ) => {
    setItems((prev) =>
      prev.map((it) => (it.posId === posId ? { ...it, [field]: value } : it)),
    );
  };

  const allComplete =
    items.length > 0 &&
    items.every((it) => it.confirmed && it.bartenderName.trim().length > 0);

  const handleSubmit = async () => {
    if (!allComplete) {
      toast.error("Completa la confirmación y el nombre del bartender en todos los POS");
      return;
    }

    setSubmitting(true);
    try {
      const payload = items.map((it) => {
        const counted = it.countedCashStr.trim() === "" ? null : Number(it.countedCashStr.replace(/[^\d.-]/g, ""));
        return {
          pos_id: it.posId,
          bartender_name: it.bartenderName.trim(),
          confirmed: true,
          notes: it.notes.trim() || null,
          closing_cash_counted: counted !== null && !Number.isNaN(counted) ? counted : null,
        };
      });

      const { data, error } = await supabase.rpc("close_jornada_manual", {
        p_jornada_id: jornadaId,
        p_cash_closings: payload,
      });

      if (error) throw new Error(error.message || "Error al cerrar jornada");
      const result = data as { success: boolean; error?: string };
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Cierre de Jornada — Confirmación física
          </DialogTitle>
          <DialogDescription>
            Confirma el cuadre físico firmado por el bartender de turno en cada POS.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            El arqueo financiero se realiza fuera del sistema usando el{" "}
            <strong>reporte físico descargable</strong> de cada POS (disponible en{" "}
            <strong>Reportes</strong>). Aquí solo registras quién firmó y observaciones.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            No hay POS activos configurados.
          </Card>
        ) : (
          <ScrollArea className="flex-1 min-h-0 max-h-[55vh] pr-3">
            <div className="space-y-3">
              {items.map((it) => (
                <Card key={it.posId} className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{it.posName}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {it.locationName}
                    </Badge>
                  </div>

                  {/* Cuadre de efectivo */}
                  <div className="rounded-md border border-border bg-muted/30 p-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Apertura</span><span className="font-mono">${it.openingCash.toLocaleString("es-CL")}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ventas alcohol (efectivo)</span><span className="font-mono">${it.cashAlcohol.toLocaleString("es-CL")}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ventas tickets (efectivo)</span><span className="font-mono">${it.cashTickets.toLocaleString("es-CL")}</span></div>
                    <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Efectivo esperado</span><span className="font-mono text-primary">${it.expectedCash.toLocaleString("es-CL")}</span></div>
                    {it.countedCashStr.trim() !== "" && !Number.isNaN(Number(it.countedCashStr.replace(/[^\d.-]/g, ""))) && (() => {
                      const counted = Number(it.countedCashStr.replace(/[^\d.-]/g, ""));
                      const diff = counted - it.expectedCash;
                      const color = diff === 0 ? "text-primary" : diff > 0 ? "text-blue-400" : "text-red-400";
                      return (
                        <div className={`flex justify-between font-semibold ${color}`}>
                          <span>{diff === 0 ? "Cuadrado" : diff > 0 ? "Sobrante" : "Faltante"}</span>
                          <span className="font-mono">${Math.abs(diff).toLocaleString("es-CL")}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <Label htmlFor={`counted-${it.posId}`} className="text-xs font-medium">
                      Efectivo contado físicamente (CLP)
                    </Label>
                    <Input
                      id={`counted-${it.posId}`}
                      inputMode="numeric"
                      placeholder="Ej: 154000"
                      value={it.countedCashStr}
                      onChange={(e) => updateItem(it.posId, "countedCashStr" as any, e.target.value)}
                      className="mt-1 h-8 text-sm font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Opcional pero recomendado: permite calcular sobrante/faltante.</p>
                  </div>

                  <div>
                    <Label
                      htmlFor={`bartender-${it.posId}`}
                      className="text-xs font-medium"
                    >
                      Bartender / Cajero de turno (firma) *
                    </Label>
                    <Input
                      id={`bartender-${it.posId}`}
                      type="text"
                      placeholder="Nombre completo"
                      value={it.bartenderName}
                      onChange={(e) =>
                        updateItem(it.posId, "bartenderName", e.target.value)
                      }
                      className="mt-1 h-8 text-sm"
                    />
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={`confirm-${it.posId}`}
                      checked={it.confirmed}
                      onCheckedChange={(v) =>
                        updateItem(it.posId, "confirmed", !!v)
                      }
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`confirm-${it.posId}`}
                      className="text-xs leading-tight cursor-pointer"
                    >
                      Confirmo que el cuadre físico fue realizado y firmado por el
                      bartender de turno.
                    </Label>
                  </div>

                  <div>
                    <Label
                      htmlFor={`notes-${it.posId}`}
                      className="text-xs font-medium"
                    >
                      Observaciones (opcional)
                    </Label>
                    <Textarea
                      id={`notes-${it.posId}`}
                      placeholder="Notas, diferencias, incidencias..."
                      value={it.notes}
                      onChange={(e) => updateItem(it.posId, "notes", e.target.value)}
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !allComplete}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
