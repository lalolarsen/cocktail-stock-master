import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveVenue } from "@/hooks/useActiveVenue";

interface POSPrintConfig {
  id: string;
  name: string;
  auto_print_enabled: boolean;
  printer_name: string | null;
}

export function PrintSettingsCard() {
  const { venue } = useActiveVenue();
  const [terminals, setTerminals] = useState<POSPrintConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchTerminals();
  }, [venue?.id]);

  const fetchTerminals = async () => {
    if (!venue?.id) return;
    const { data, error } = await supabase
      .from("pos_terminals")
      .select("id, name, auto_print_enabled, printer_name")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setTerminals(data);
    }
    setIsLoading(false);
  };

  const handleToggle = async (posId: string, enabled: boolean) => {
    setIsSaving(posId);
    const { error } = await supabase
      .from("pos_terminals")
      .update({ auto_print_enabled: enabled })
      .eq("id", posId);

    if (error) {
      toast.error("Error al guardar");
    } else {
      setTerminals((prev) =>
        prev.map((t) => (t.id === posId ? { ...t, auto_print_enabled: enabled } : t))
      );
      toast.success(enabled ? "Impresión automática activada" : "Impresión automática desactivada");
    }
    setIsSaving(null);
  };

  const handlePrinterName = async (posId: string, printerName: string) => {
    setIsSaving(posId);
    const { error } = await supabase
      .from("pos_terminals")
      .update({ printer_name: printerName || null })
      .eq("id", posId);

    if (error) {
      toast.error("Error al guardar nombre de impresora");
    } else {
      setTerminals((prev) =>
        prev.map((t) => (t.id === posId ? { ...t, printer_name: printerName } : t))
      );
      toast.success("Impresora guardada");
    }
    setIsSaving(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="w-5 h-5" />
          Impresión Automática
        </CardTitle>
        <CardDescription>
          Configura si cada caja imprime el recibo automáticamente al completar una venta. La
          impresión se realiza a través del diálogo nativo del navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {terminals.map((pos) => (
          <div key={pos.id} className="p-4 rounded-lg border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{pos.name}</p>
                <p className="text-xs text-muted-foreground">
                  {pos.auto_print_enabled
                    ? "Impresión automática activa"
                    : "Impresión manual (diálogo al hacer clic)"}
                </p>
              </div>
              <Switch
                checked={pos.auto_print_enabled}
                onCheckedChange={(checked) => handleToggle(pos.id, checked)}
                disabled={isSaving === pos.id}
              />
            </div>

            {pos.auto_print_enabled && (
              <div className="space-y-2">
                <Label className="text-xs">Etiqueta de impresora (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: Caja 1, Barra Norte"
                    defaultValue={pos.printer_name || ""}
                    className="text-sm"
                    onBlur={(e) => {
                      if (e.target.value !== (pos.printer_name || "")) {
                        handlePrinterName(pos.id, e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  {isSaving === pos.id && (
                    <Loader2 className="w-4 h-4 animate-spin self-center" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Solo para identificar la impresora en el historial. La selección real de
                  impresora se hace en el diálogo del navegador.
                </p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
