import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Gift, Loader2, CheckCircle, XCircle, QrCode } from "lucide-react";

type CourtesyResult = {
  id: string;
  code: string;
  product_id: string;
  product_name: string;
  qty: number;
  status: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
};

interface CourtesyRedeemDialogProps {
  open: boolean;
  onClose: () => void;
  onRedeemed: (item: { cocktailId: string; name: string; qty: number }) => void;
}

export function CourtesyRedeemDialog({ open, onClose, onRedeemed }: CourtesyRedeemDialogProps) {
  const { user, activeJornadaId } = useAppSession();
  const { venue } = useActiveVenue();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; data?: CourtesyResult } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const validate = async () => {
    const cleanCode = code.trim().replace(/^COURTESY:/i, "");
    if (!cleanCode) {
      toast.error("Ingresa un código");
      return;
    }

    if (!venue?.id || !user?.id || !activeJornadaId) {
      toast.error("Requiere jornada activa");
      return;
    }

    setLoading(true);
    try {
      // Lookup courtesy QR
      const { data: qr, error } = await supabase
        .from("courtesy_qr")
        .select("*")
        .eq("code", cleanCode)
        .eq("venue_id", venue.id)
        .maybeSingle();

      if (error) throw error;

      if (!qr) {
        setResult({ success: false, message: "QR no encontrado" });
        return;
      }

      // Validate status
      if (qr.status === "cancelled") {
        setResult({ success: false, message: "Este QR fue cancelado" });
        return;
      }
      if (qr.status === "redeemed") {
        setResult({ success: false, message: "Este QR ya fue canjeado" });
        return;
      }

      // Check expiry
      if (new Date(qr.expires_at) < new Date()) {
        // Auto-update status to expired
        await supabase.from("courtesy_qr").update({ status: "expired" }).eq("id", qr.id);
        setResult({ success: false, message: "Este QR ha expirado" });
        return;
      }

      // Check uses
      if (qr.used_count >= qr.max_uses) {
        await supabase.from("courtesy_qr").update({ status: "redeemed" }).eq("id", qr.id);
        setResult({ success: false, message: "Este QR ya alcanzó el máximo de usos" });
        return;
      }

      // Valid!
      setResult({
        success: true,
        message: `${qr.product_name} × ${qr.qty}`,
        data: qr as CourtesyResult,
      });
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Error al validar" });
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = () => {
    if (!result?.data) return;
    onRedeemed({
      cocktailId: result.data.product_id,
      name: result.data.product_name,
      qty: result.data.qty,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (result?.success) {
        handleRedeem();
      } else {
        validate();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Canjear QR Cortesía
          </DialogTitle>
          <DialogDescription>
            Escanea o ingresa el código del QR de cortesía
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Código QR…"
              value={code}
              onChange={(e) => { setCode(e.target.value); setResult(null); }}
              onKeyDown={handleKeyDown}
              className="font-mono text-lg tracking-wide"
              autoFocus
            />
            <Button onClick={validate} disabled={loading || !code.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            </Button>
          </div>

          {result && (
            <div
              className={`p-4 rounded-lg border-2 ${
                result.success
                  ? "border-green-500/50 bg-green-500/10"
                  : "border-destructive/50 bg-destructive/10"
              }`}
            >
              <div className="flex items-center gap-3">
                {result.success ? (
                  <CheckCircle className="w-6 h-6 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-destructive shrink-0" />
                )}
                <div>
                  <p className={`font-medium ${result.success ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
                    {result.success ? "QR válido" : "QR inválido"}
                  </p>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                </div>
              </div>
            </div>
          )}

          {result?.success && (
            <Button onClick={handleRedeem} className="w-full" size="lg">
              <Gift className="w-4 h-4 mr-2" />
              Agregar al carrito (cortesía)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
