import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings, Save } from "lucide-react";
import { toast } from "sonner";

interface DayConfig {
  id?: string;
  dia_semana: number;
  hora_apertura: string;
  hora_cierre: string;
  activo: boolean;
}

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

export function JornadaConfig() {
  const [configs, setConfigs] = useState<DayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("jornada_config")
        .select("*")
        .order("dia_semana");

      if (error) throw error;

      // Create full week config, filling in missing days
      const fullConfig = DAYS.map((day) => {
        const existing = data?.find((d) => d.dia_semana === day.value);
        return existing || {
          dia_semana: day.value,
          hora_apertura: "18:00",
          hora_cierre: "02:00",
          activo: false,
        };
      });

      setConfigs(fullConfig);
    } catch (error) {
      console.error("Error fetching config:", error);
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (dayIndex: number, field: keyof DayConfig, value: any) => {
    setConfigs((prev) =>
      prev.map((config) =>
        config.dia_semana === dayIndex ? { ...config, [field]: value } : config
      )
    );
  };

  const saveConfigs = async () => {
    setSaving(true);
    try {
      for (const config of configs) {
        if (config.id) {
          // Update existing
          const { error } = await supabase
            .from("jornada_config")
            .update({
              hora_apertura: config.hora_apertura,
              hora_cierre: config.hora_cierre,
              activo: config.activo,
            })
            .eq("id", config.id);

          if (error) throw error;
        } else if (config.activo) {
          // Insert new only if active
          const { error } = await supabase
            .from("jornada_config")
            .insert({
              dia_semana: config.dia_semana,
              hora_apertura: config.hora_apertura,
              hora_cierre: config.hora_cierre,
              activo: config.activo,
            });

          if (error) throw error;
        }
      }

      toast.success("Configuración guardada");
      fetchConfigs();
    } catch (error) {
      console.error("Error saving config:", error);
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
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

  const activeDays = configs.filter((c) => c.activo).length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Configuración de Jornadas</h3>
        </div>
        <Button onClick={saveConfigs} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Guardar Cambios
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {activeDays} días activos por semana. Las jornadas se abrirán y cerrarán automáticamente según estos horarios.
      </p>

      <div className="space-y-4">
        {DAYS.map((day) => {
          const config = configs.find((c) => c.dia_semana === day.value)!;
          return (
            <div
              key={day.value}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                config.activo ? "bg-primary/5 border-primary/20" : "bg-muted/30"
              }`}
            >
              <div className="w-24">
                <Label className="font-medium">{day.label}</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={config.activo}
                  onCheckedChange={(checked) => updateConfig(day.value, "activo", checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {config.activo ? "Activo" : "Inactivo"}
                </span>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Label className="text-sm text-muted-foreground">Apertura:</Label>
                <Input
                  type="time"
                  value={config.hora_apertura}
                  onChange={(e) => updateConfig(day.value, "hora_apertura", e.target.value)}
                  disabled={!config.activo}
                  className="w-32"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Cierre:</Label>
                <Input
                  type="time"
                  value={config.hora_cierre}
                  onChange={(e) => updateConfig(day.value, "hora_cierre", e.target.value)}
                  disabled={!config.activo}
                  className="w-32"
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
