import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Store, DollarSign, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";

interface POSTerminal {
  id: string;
  name: string;
}

interface CashSettings {
  cash_opening_mode: "prompt" | "auto";
  default_opening_amount: number;
}

interface POSDefault {
  pos_id: string;
  default_amount: number;
}

interface CashAmount {
  pos_id: string;
  pos_name: string;
  amount: number;
}

interface JornadaCashOpeningDialogProps {
  open: boolean;
  onClose: () => void;
  jornadaId: string;
  onSuccess: () => void;
}

export function JornadaCashOpeningDialog({
  open,
  onClose,
  jornadaId,
  onSuccess,
}: JornadaCashOpeningDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [cashSettings, setCashSettings] = useState<CashSettings>({
    cash_opening_mode: "prompt",
    default_opening_amount: 0,
  });
  const [posDefaults, setPosDefaults] = useState<POSDefault[]>([]);
  const [cashAmounts, setCashAmounts] = useState<CashAmount[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch active POS terminals
      const { data: posData } = await supabase
        .from("pos_terminals")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      // Fetch cash settings
      const { data: settingsData } = await supabase
        .from("jornada_cash_settings")
        .select("*")
        .maybeSingle();

      // Fetch per-POS defaults
      const { data: defaultsData } = await supabase
        .from("jornada_cash_pos_defaults")
        .select("pos_id, default_amount");

      const terminals = posData || [];
      setPosTerminals(terminals);

      const settings: CashSettings = {
        cash_opening_mode: (settingsData?.cash_opening_mode as "prompt" | "auto") || "prompt",
        default_opening_amount: Number(settingsData?.default_opening_amount) || 0,
      };
      setCashSettings(settings);

      const defaults = defaultsData || [];
      setPosDefaults(defaults);

      // Initialize cash amounts with defaults
      const amounts: CashAmount[] = terminals.map((pos) => {
        const posDefault = defaults.find((d) => d.pos_id === pos.id);
        const amount = posDefault?.default_amount ?? settings.default_opening_amount;
        return {
          pos_id: pos.id,
          pos_name: pos.name,
          amount: Number(amount) || 0,
        };
      });
      setCashAmounts(amounts);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  const updateAmount = (posId: string, value: string) => {
    const numValue = parseInt(value.replace(/\D/g, ""), 10) || 0;
    setCashAmounts((prev) =>
      prev.map((item) =>
        item.pos_id === posId ? { ...item, amount: numValue } : item
      )
    );
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const cashData = cashAmounts.map((item) => ({
        pos_id: item.pos_id,
        amount: item.amount,
      }));

      // Log audit event for opening
      await supabase.from("jornada_audit_log").insert({
        jornada_id: jornadaId,
        action: "opened",
        actor_source: "ui",
        reason: "Admin inició jornada con efectivo inicial",
        meta: { 
          cash_amounts: cashData,
          total_cash: cashData.reduce((sum, item) => sum + item.amount, 0),
        },
      });

      const { data, error } = await supabase.rpc("start_jornada_with_cash", {
        p_jornada_id: jornadaId,
        p_cash_amounts: cashData,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Error al iniciar jornada");
      }

      toast.success("Jornada iniciada con arqueo de caja");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error starting jornada:", error);
      toast.error(error.message || "Error al iniciar jornada");
    } finally {
      setSaving(false);
    }
  };

  const totalCash = cashAmounts.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Efectivo Inicial por Caja
          </DialogTitle>
          <DialogDescription>
            Ingresa el monto de efectivo inicial en cada caja para comenzar la jornada.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : posTerminals.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            No hay cajas configuradas. Configura al menos una caja en Administración.
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {cashSettings.cash_opening_mode === "auto" && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Modo automático: valores pre-llenados desde configuración
                </span>
              </div>
            )}

            <div className="space-y-3">
              {cashAmounts.map((item) => (
                <div
                  key={item.pos_id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <Store className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <Label className="font-medium">{item.pos_name}</Label>
                  </div>
                  <div className="w-32">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.amount > 0 ? formatCLP(item.amount).replace("$", "") : ""}
                      onChange={(e) => updateAmount(item.pos_id, e.target.value)}
                      placeholder="$0"
                      className="text-right font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-lg font-semibold">Total:</span>
              <span className="text-2xl font-bold text-primary">
                {formatCLP(totalCash)}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || loading || posTerminals.length === 0}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Iniciando...
              </>
            ) : (
              "Iniciar Jornada"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
