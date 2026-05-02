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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck, Info } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
  const [observacion, setObservacion] = useState("");

  useEffect(() => {
    if (open) setObservacion("");
  }, [open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("close_jornada_manual", {
        p_jornada_id: jornadaId,
        p_cash_closings: [],
        p_observacion: observacion.trim() || null,
      } as any);

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Cerrar jornada
          </DialogTitle>
          <DialogDescription>
            Registra una observación opcional sobre el cuadre. Quedará en el
            reporte enviado por correo a gerencia.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            El arqueo financiero se realiza fuera del sistema usando el reporte
            físico descargable de cada POS. Aquí solo registras una nota global
            opcional.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacion" className="text-sm font-medium">
            Observación del cuadre <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Textarea
            id="observacion"
            placeholder="Ej: Caja Principal cuadró exacto. Pista con sobrante de $5.000 sin justificar…"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={5}
            className="resize-none text-sm"
            maxLength={1000}
          />
          <p className="text-[10px] text-muted-foreground text-right">
            {observacion.length}/1000
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cerrando...
              </>
            ) : (
              "Cerrar jornada"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
