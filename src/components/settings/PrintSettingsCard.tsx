import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isQZConnected, listPrinters } from "@/lib/printing/qz";
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
  const [qzStatus, setQzStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);

  useEffect(() => {
    fetchTerminals();
    checkQz();
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

  const checkQz = async () => {
    setQzStatus("checking");
    const connected = await isQZConnected();
    setQzStatus(connected ? "connected" : "disconnected");
    if (connected) {
      try {
        const printers = await listPrinters();
        setAvailablePrinters(printers);
      } catch {
        setAvailablePrinters([]);
      }
    }
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Impresión Automática (QZ Tray)
            </CardTitle>
            <CardDescription>
              Imprime boletas y QR automáticamente en impresoras térmicas XPrinter sin diálogo del navegador.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                qzStatus === "connected"
                  ? "border-green-500/40 text-green-600 bg-green-500/10"
                  : qzStatus === "disconnected"
                  ? "border-destructive/40 text-destructive bg-destructive/10"
                  : "border-muted"
              }
            >
              {qzStatus === "checking" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {qzStatus === "connected" && <CheckCircle className="w-3 h-3 mr-1" />}
              {qzStatus === "disconnected" && <XCircle className="w-3 h-3 mr-1" />}
              {qzStatus === "connected" ? "QZ Conectado" : qzStatus === "disconnected" ? "QZ No Detectado" : "Verificando…"}
            </Badge>
            <Button variant="ghost" size="icon" onClick={checkQz} className="h-8 w-8">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {qzStatus === "disconnected" && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm space-y-2">
            <p className="font-medium text-amber-700">QZ Tray no detectado</p>
            <p className="text-muted-foreground">
              Para impresión automática, instala y ejecuta{" "}
              <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                QZ Tray
              </a>{" "}
              en este equipo. Luego haz clic en "Verificar" arriba.
            </p>
          </div>
        )}

        {availablePrinters.length > 0 && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-1">Impresoras detectadas:</p>
            <div className="flex flex-wrap gap-1">
              {availablePrinters.map((p) => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {terminals.map((pos) => (
            <div key={pos.id} className="p-4 rounded-lg border border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{pos.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pos.auto_print_enabled ? "Impresión automática activa" : "Impresión manual (diálogo)"}
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
                  <Label className="text-xs">Nombre de impresora</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ej: XP-58, Xprinter, POS-58"
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
                    {isSaving === pos.id && <Loader2 className="w-4 h-4 animate-spin self-center" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Debe coincidir con el nombre exacto de la impresora en el sistema (visible arriba si QZ está conectado).
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
