import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CreditCard, Banknote, CheckCircle, Monitor } from "lucide-react";
import { useReceiptConfig, ReceiptMode } from "@/hooks/useReceiptConfig";
import { toast } from "sonner";

export function ReceiptSettingsCard() {
  const { receiptMode, activeProvider, isLoading, updateReceiptMode } = useReceiptConfig();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ReceiptMode | null>(null);

  // Use selectedMode if user has made a selection, otherwise use current config
  const displayMode = selectedMode ?? receiptMode;

  const handleModeChange = async (mode: ReceiptMode) => {
    setSelectedMode(mode);
  };

  const handleSave = async () => {
    if (!selectedMode || selectedMode === receiptMode) return;
    
    setIsSaving(true);
    const success = await updateReceiptMode(selectedMode);
    setIsSaving(false);

    if (success) {
      toast.success("Configuración guardada");
      setSelectedMode(null); // Reset selection after save
    } else {
      toast.error("Error al guardar configuración");
    }
  };

  const hasChanges = selectedMode !== null && selectedMode !== receiptMode;

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
              <FileText className="w-5 h-5" />
              Emisión de Boletas
            </CardTitle>
            <CardDescription>
              Configura cómo se emiten los comprobantes según el método de pago
            </CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            Proveedor: {activeProvider}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          {/* Hybrid Mode */}
          <div
            onClick={() => handleModeChange("hybrid")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              displayMode === "hybrid"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${displayMode === "hybrid" ? "bg-primary/10" : "bg-muted"}`}>
                <CreditCard className={`w-5 h-5 ${displayMode === "hybrid" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold cursor-pointer">
                    Modo Híbrido
                  </Label>
                  {displayMode === "hybrid" && (
                    <CheckCircle className="w-4 h-4 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  El POS externo emite comprobantes para pagos con <strong>tarjeta</strong>. 
                  El sistema emite boletas solo para pagos en <strong>efectivo</strong>.
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CreditCard className="w-3 h-3" />
                    Tarjeta → Boleta externa
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Banknote className="w-3 h-3" />
                    Efectivo → Boleta interna
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Unified Mode */}
          <div
            onClick={() => handleModeChange("unified")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              displayMode === "unified"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${displayMode === "unified" ? "bg-primary/10" : "bg-muted"}`}>
                <FileText className={`w-5 h-5 ${displayMode === "unified" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold cursor-pointer">
                    Modo Unificado
                  </Label>
                  {displayMode === "unified" && (
                    <CheckCircle className="w-4 h-4 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  El sistema emite boletas para <strong>todos</strong> los pagos, 
                  independiente del método de pago.
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CreditCard className="w-3 h-3" />
                    Tarjeta → Boleta interna
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Banknote className="w-3 h-3" />
                    Efectivo → Boleta interna
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* External Mode */}
          <div
            onClick={() => handleModeChange("external")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              displayMode === "external"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${displayMode === "external" ? "bg-primary/10" : "bg-muted"}`}>
                <Monitor className={`w-5 h-5 ${displayMode === "external" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold cursor-pointer">
                    Modo Externo
                  </Label>
                  {displayMode === "external" && (
                    <CheckCircle className="w-4 h-4 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>Todas</strong> las boletas son emitidas por el POS externo o tercero.
                  El sistema solo registra la venta internamente.
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CreditCard className="w-3 h-3" />
                    Tarjeta → Boleta externa
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Banknote className="w-3 h-3" />
                    Efectivo → Boleta externa
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
