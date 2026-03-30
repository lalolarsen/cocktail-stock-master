import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface VoidRequestDialogProps {
  saleId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function VoidRequestDialog({ saleId, onClose, onSuccess }: VoidRequestDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!saleId || !reason.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("request_sale_void", {
        p_sale_id: saleId,
        p_reason: reason.trim(),
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Solicitud de anulación enviada");
      setReason("");
      setNotes("");
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Error al enviar solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!saleId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar anulación</DialogTitle>
          <DialogDescription>
            La solicitud será revisada por un administrador antes de ejecutarse.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Textarea
              placeholder="Describe el motivo de la anulación..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Notas adicionales</Label>
            <Textarea
              placeholder="Información adicional (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
