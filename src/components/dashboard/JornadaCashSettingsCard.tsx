import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, DollarSign, Store, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";

interface POSTerminal {
  id: string;
  name: string;
}

interface CashSettings {
  id?: string;
  cash_opening_mode: "prompt" | "auto";
  default_opening_amount: number;
  auto_close_enabled: boolean;
}

interface POSDefault {
  id?: string;
  pos_id: string;
  default_amount: number;
}

export function JornadaCashSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posTerminals, setPosTerminals] = useState<POSTerminal[]>([]);
  const [settings, setSettings] = useState<CashSettings>({
    cash_opening_mode: "prompt",
    default_opening_amount: 0,
    auto_close_enabled: false,
  });
  const [posDefaults, setPosDefaults] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch POS terminals
      const { data: posData } = await supabase
        .from("pos_terminals")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      // Fetch settings
      const { data: settingsData } = await supabase
        .from("jornada_cash_settings")
        .select("*")
        .maybeSingle();

      // Fetch per-POS defaults
      const { data: defaultsData } = await supabase
        .from("jornada_cash_pos_defaults")
        .select("pos_id, default_amount");

      setPosTerminals(posData || []);
      
      if (settingsData) {
        setSettings({
          id: settingsData.id,
          cash_opening_mode: settingsData.cash_opening_mode as "prompt" | "auto",
          default_opening_amount: Number(settingsData.default_opening_amount) || 0,
          auto_close_enabled: settingsData.auto_close_enabled ?? false,
        });
      }

      const defaultsMap = new Map<string, number>();
      (defaultsData || []).forEach((d) => {
        defaultsMap.set(d.pos_id, Number(d.default_amount) || 0);
      });
      setPosDefaults(defaultsMap);
    } catch (error) {
      console.error("Error loading cash settings:", error);
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert settings
      const { error: settingsError } = await supabase
        .from("jornada_cash_settings")
        .upsert({
          id: settings.id,
          cash_opening_mode: settings.cash_opening_mode,
          default_opening_amount: settings.default_opening_amount,
          auto_close_enabled: settings.auto_close_enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: "venue_id" });

      if (settingsError) throw settingsError;

      // Upsert per-POS defaults
      for (const [posId, amount] of posDefaults.entries()) {
        const { error: posError } = await supabase
          .from("jornada_cash_pos_defaults")
          .upsert({
            pos_id: posId,
            default_amount: amount,
            updated_at: new Date().toISOString(),
          }, { onConflict: "venue_id,pos_id" });

        if (posError) throw posError;
      }

      toast.success("Configuración guardada");
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const updatePosDefault = (posId: string, value: string) => {
    const numValue = parseInt(value.replace(/\D/g, ""), 10) || 0;
    setPosDefaults((prev) => new Map(prev).set(posId, numValue));
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Configuración de Efectivo Inicial</h3>
      </div>

      <div className="space-y-4">
        {/* Auto-close safety toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <Label className="font-medium">Cierre automático de jornadas</Label>
              <p className="text-sm text-muted-foreground">
                {settings.auto_close_enabled
                  ? "Las jornadas se cerrarán automáticamente según horario configurado"
                  : "Las jornadas solo se cierran manualmente (recomendado)"}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.auto_close_enabled}
            onCheckedChange={(checked) =>
              setSettings((s) => ({
                ...s,
                auto_close_enabled: checked,
              }))
            }
          />
        </div>

        {/* Mode toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <Label className="font-medium">Modo de apertura de efectivo</Label>
            <p className="text-sm text-muted-foreground">
              {settings.cash_opening_mode === "auto"
                ? "Automático: valores pre-llenados, editables antes de confirmar"
                : "Manual: ingresar valores cada vez"}
            </p>
          </div>
          <Switch
            checked={settings.cash_opening_mode === "auto"}
            onCheckedChange={(checked) =>
              setSettings((s) => ({
                ...s,
                cash_opening_mode: checked ? "auto" : "prompt",
              }))
            }
          />
        </div>

        {/* Global default */}
        <div className="space-y-2">
          <Label>Monto por defecto (global)</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={
              settings.default_opening_amount > 0
                ? formatCLP(settings.default_opening_amount).replace("$", "")
                : ""
            }
            onChange={(e) => {
              const val = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0;
              setSettings((s) => ({ ...s, default_opening_amount: val }));
            }}
            placeholder="$0"
            className="max-w-xs font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Se usa si no hay un valor específico para la caja
          </p>
        </div>

        {/* Per-POS defaults */}
        {posTerminals.length > 0 && (
          <div className="space-y-3">
            <Label>Montos por caja (opcional)</Label>
            <div className="space-y-2">
              {posTerminals.map((pos) => (
                <div
                  key={pos.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <Store className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{pos.name}</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={
                      (posDefaults.get(pos.id) || 0) > 0
                        ? formatCLP(posDefaults.get(pos.id) || 0).replace("$", "")
                        : ""
                    }
                    onChange={(e) => updatePosDefault(pos.id, e.target.value)}
                    placeholder="Usar global"
                    className="w-32 text-right font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="w-4 h-4 mr-2" />
            Guardar Configuración
          </>
        )}
      </Button>
    </Card>
  );
}
