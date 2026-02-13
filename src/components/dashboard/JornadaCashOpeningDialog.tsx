import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  Store,
  DollarSign,
  Settings2,
  Tag,
  Calendar,
  Clock,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  jornadaId: string | null;
  onSuccess: () => void;
}

type WizardStep = "identification" | "cash" | "confirm";

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
  const [cashAmounts, setCashAmounts] = useState<CashAmount[]>([]);
  const [step, setStep] = useState<WizardStep>("identification");
  const [jornadaNombre, setJornadaNombre] = useState("");

  // Auto-generate default name
  const generateDefaultName = () => {
    const now = new Date();
    const santiagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
    return format(santiagoDate, "EEEE d MMM yyyy", { locale: es });
  };

  const getTodayDate = () => {
    const now = new Date();
    const santiagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
    return format(santiagoDate, "EEEE d 'de' MMMM yyyy", { locale: es });
  };

  const getCurrentTime = () => {
    const now = new Date();
    const santiagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
    return format(santiagoDate, "HH:mm");
  };

  useEffect(() => {
    if (open) {
      setStep("identification");
      setJornadaNombre(generateDefaultName());
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [posResult, settingsResult, defaultsResult] = await Promise.all([
        supabase.from("pos_terminals").select("id, name").eq("is_active", true).eq("is_cash_register", true).order("name"),
        supabase.from("jornada_cash_settings").select("*").maybeSingle(),
        supabase.from("jornada_cash_pos_defaults").select("pos_id, default_amount"),
      ]);

      const terminals = posResult.data || [];
      setPosTerminals(terminals);

      const settings: CashSettings = {
        cash_opening_mode: (settingsResult.data?.cash_opening_mode as "prompt" | "auto") || "prompt",
        default_opening_amount: Number(settingsResult.data?.default_opening_amount) || 0,
      };
      setCashSettings(settings);

      const defaults = defaultsResult.data || [];

      const amounts: CashAmount[] = terminals.map((pos) => {
        const posDefault = defaults.find((d: POSDefault) => d.pos_id === pos.id);
        const amount = posDefault?.default_amount ?? settings.default_opening_amount;
        return { pos_id: pos.id, pos_name: pos.name, amount: Number(amount) || 0 };
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
      prev.map((item) => (item.pos_id === posId ? { ...item, amount: numValue } : item))
    );
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const now = new Date();
      const santiagoDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
      const today = `${santiagoDate.getFullYear()}-${String(santiagoDate.getMonth() + 1).padStart(2, "0")}-${String(santiagoDate.getDate()).padStart(2, "0")}`;

      const { data: existing } = await supabase
        .from("jornadas")
        .select("id")
        .eq("estado", "activa")
        .eq("fecha", today)
        .limit(1)
        .maybeSingle();

      if (existing) {
        toast.error("Ya existe una jornada activa hoy. No se puede abrir otra.");
        setSaving(false);
        onClose();
        return;
      }

      const cashData = cashAmounts.map((item) => ({ pos_id: item.pos_id, amount: item.amount }));

      const { data, error } = await supabase.rpc("open_jornada_manual", {
        p_cash_amounts: cashData,
        p_nombre: jornadaNombre.trim(),
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Error al abrir jornada");
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error opening jornada:", error);
      toast.error(error.message || "Error al abrir jornada");
    } finally {
      setSaving(false);
    }
  };

  const totalCash = cashAmounts.reduce((sum, item) => sum + item.amount, 0);
  const canProceedFromIdentification = jornadaNombre.trim().length > 0;

  const steps: WizardStep[] = ["identification", "cash", "confirm"];
  const currentStepIndex = steps.indexOf(step);

  const stepConfig: Record<WizardStep, { title: string; desc: string; icon: React.ReactNode }> = {
    identification: { title: "Identificación", desc: "Nombre y datos de la jornada", icon: <Tag className="w-5 h-5" /> },
    cash: { title: "Montos Iniciales", desc: "Efectivo de apertura por POS", icon: <DollarSign className="w-5 h-5" /> },
    confirm: { title: "Confirmación", desc: "Verifica y confirma la apertura", icon: <ShieldCheck className="w-5 h-5" /> },
  };

  const currentConfig = stepConfig[step];

  const renderIdentification = () => (
    <div className="space-y-5 py-2">
      <div className="space-y-2">
        <Label htmlFor="jornada-nombre" className="font-medium">
          Nombre de la jornada *
        </Label>
        <Input
          id="jornada-nombre"
          value={jornadaNombre}
          onChange={(e) => setJornadaNombre(e.target.value)}
          placeholder="Ej: Viernes 13 Feb 2026"
          className="text-base"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Se sugiere un nombre por defecto. Puedes editarlo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Calendar className="w-4 h-4" />
            Fecha
          </div>
          <p className="font-medium text-sm capitalize">{getTodayDate()}</p>
        </Card>
        <Card className="p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            Hora apertura
          </div>
          <p className="font-medium text-sm">{getCurrentTime()}</p>
        </Card>
      </div>
    </div>
  );

  const renderCash = () => (
    <div className="flex-1 min-h-0 space-y-4 py-2">
      {cashSettings.cash_opening_mode === "auto" && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Modo automático: valores pre-llenados desde configuración
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : posTerminals.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground">
          No hay cajas configuradas. Configura al menos una caja en Administración.
        </div>
      ) : (
        <>
          <ScrollArea className="h-[35vh] min-h-[180px]">
            <div className="space-y-3 pr-4">
              {cashAmounts.map((item) => (
                <div key={item.pos_id} className="flex items-center gap-3 p-3 border rounded-lg">
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
          </ScrollArea>

          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-lg font-semibold">Total:</span>
            <span className="text-2xl font-bold text-primary">{formatCLP(totalCash)}</span>
          </div>
        </>
      )}
    </div>
  );

  const renderConfirm = () => (
    <div className="space-y-4 py-2">
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Nombre</span>
            <span className="font-semibold">{jornadaNombre}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fecha</span>
            <span className="font-medium capitalize">{getTodayDate()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Hora apertura</span>
            <span className="font-medium">{getCurrentTime()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">POS activos</span>
            <Badge variant="outline">{posTerminals.length}</Badge>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Efectivo total apertura</span>
            <span className="text-lg font-bold text-primary">{formatCLP(totalCash)}</span>
          </div>
        </div>
      </Card>

      <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
        Estás por abrir la jornada "<strong className="text-foreground">{jornadaNombre}</strong>".
        Las ventas quedarán habilitadas.
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentConfig.icon}
            {currentConfig.title}
          </DialogTitle>
          <DialogDescription>{currentConfig.desc}</DialogDescription>
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < currentStepIndex ? "bg-primary text-primary-foreground"
                    : i === currentStepIndex ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i < currentStepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i < currentStepIndex ? "bg-primary" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {step === "identification" && renderIdentification()}
          {step === "cash" && renderCash()}
          {step === "confirm" && renderConfirm()}
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          {currentStepIndex > 0 ? (
            <Button variant="outline" onClick={() => setStep(steps[currentStepIndex - 1])} disabled={saving}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Atrás
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
          )}

          {step === "identification" && (
            <Button onClick={() => setStep("cash")} disabled={!canProceedFromIdentification}>
              Siguiente
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === "cash" && (
            <Button onClick={() => setStep("confirm")} disabled={loading || posTerminals.length === 0}>
              Siguiente
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === "confirm" && (
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Abriendo...
                </>
              ) : (
                "Confirmar Apertura"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
