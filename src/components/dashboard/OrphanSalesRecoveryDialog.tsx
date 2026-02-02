import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";

interface OrphanSale {
  id: string;
  sale_number: string;
  total_amount: number;
  created_at: string;
  sale_category: string;
}

interface Jornada {
  id: string;
  numero_jornada: number;
  fecha: string;
  estado: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orphanCount: number;
  onRecoveryComplete: () => void;
}

export function OrphanSalesRecoveryDialog({ 
  open, 
  onOpenChange, 
  orphanCount,
  onRecoveryComplete 
}: Props) {
  const [loading, setLoading] = useState(false);
  const [orphanSales, setOrphanSales] = useState<OrphanSale[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [selectedJornadaId, setSelectedJornadaId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch orphan sales (where jornada_id is null)
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, sale_number, total_amount, created_at, sale_category")
        .is("jornada_id", null)
        .order("created_at", { ascending: false })
        .limit(100);

      if (salesError) throw salesError;
      setOrphanSales(salesData || []);

      // Fetch available jornadas (recent ones, including active)
      const { data: jornadasData, error: jornadasError } = await supabase
        .from("jornadas")
        .select("id, numero_jornada, fecha, estado")
        .order("fecha", { ascending: false })
        .limit(20);

      if (jornadasError) throw jornadasError;
      setJornadas(jornadasData || []);

      // Default to active jornada if available
      const activeJornada = jornadasData?.find(j => j.estado === "activa");
      if (activeJornada) {
        setSelectedJornadaId(activeJornada.id);
      } else if (jornadasData?.length) {
        setSelectedJornadaId(jornadasData[0].id);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedJornadaId) {
      toast.error("Selecciona una jornada");
      return;
    }

    if (orphanSales.length === 0) {
      toast.info("No hay ventas sin jornada");
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      const orphanIds = orphanSales.map(s => s.id);
      
      const { error } = await supabase
        .from("sales")
        .update({ jornada_id: selectedJornadaId })
        .in("id", orphanIds);

      if (error) throw error;

      const selectedJornada = jornadas.find(j => j.id === selectedJornadaId);
      toast.success(
        `${orphanSales.length} ventas reasignadas a Jornada #${selectedJornada?.numero_jornada || "?"}`
      );
      
      onRecoveryComplete();
      onOpenChange(false);
    } catch (error) {
      console.error("Error reassigning sales:", error);
      toast.error("Error al reasignar ventas");
    } finally {
      setSubmitting(false);
    }
  };

  const totalOrphanAmount = orphanSales.reduce((sum, s) => sum + Number(s.total_amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Reasignar ventas sin jornada
          </DialogTitle>
          <DialogDescription>
            Hay ventas que no están asociadas a ninguna jornada. Asígnalas a una jornada para que aparezcan en los reportes.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : orphanSales.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
            <p className="text-muted-foreground">No hay ventas sin jornada</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 space-y-4">
            {/* Summary */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-amber-600">
                    {orphanSales.length} ventas sin jornada
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total: {formatCLP(totalOrphanAmount)}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent orphan sales preview with ScrollArea */}
            <ScrollArea className="max-h-40">
              <div className="space-y-2 pr-3">
                {orphanSales.slice(0, 10).map(sale => (
                  <div 
                    key={sale.id} 
                    className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
                  >
                    <div>
                      <span className="font-mono">{sale.sale_number}</span>
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(sale.created_at), "dd/MM HH:mm")}
                      </span>
                    </div>
                    <span className="font-medium">{formatCLP(sale.total_amount)}</span>
                  </div>
                ))}
                {orphanSales.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    +{orphanSales.length - 10} más...
                  </p>
                )}
              </div>
            </ScrollArea>

            {/* Target jornada selector */}
            <div className="space-y-2">
              <Label>Asignar a jornada</Label>
              <Select value={selectedJornadaId} onValueChange={setSelectedJornadaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar jornada..." />
                </SelectTrigger>
                <SelectContent>
                  {jornadas.map(j => (
                    <SelectItem key={j.id} value={j.id}>
                      Jornada #{j.numero_jornada} - {format(new Date(j.fecha), "dd/MM/yyyy")}
                      {j.estado === "activa" && " (Activa)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleReassign} 
            disabled={submitting || orphanSales.length === 0 || !selectedJornadaId}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reasignando...
              </>
            ) : (
              `Reasignar ${orphanSales.length} ventas`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
