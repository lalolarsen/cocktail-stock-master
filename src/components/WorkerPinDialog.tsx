import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WorkerPinDialogProps {
  open: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

export default function WorkerPinDialog({ open, onVerified, onCancel }: WorkerPinDialogProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!pin.trim()) {
      toast.error("Ingresa tu número de identificación");
      return;
    }

    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        toast.error("No hay sesión activa");
        onCancel();
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("worker_pin")
        .eq("id", session.session.user.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        toast.error("Error al verificar credenciales");
        return;
      }

      if (!profile?.worker_pin) {
        toast.error("No tienes un PIN asignado. Contacta al administrador.");
        return;
      }

      if (profile.worker_pin !== pin) {
        toast.error("Número de identificación incorrecto");
        return;
      }

      toast.success("Verificación exitosa");
      setPin("");
      onVerified();
    } catch (error) {
      console.error("Verification error:", error);
      toast.error("Error al verificar");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Identificación del Trabajador
          </DialogTitle>
          <DialogDescription>
            Ingresa tu número de identificación personal para acceder al sistema de ventas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="worker-pin">Número de Identificación</Label>
            <Input
              id="worker-pin"
              type="password"
              placeholder="Ingresa tu PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleVerify} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Verificar"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
