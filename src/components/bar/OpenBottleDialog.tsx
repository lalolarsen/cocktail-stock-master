import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Wine, AlertTriangle, CheckCircle2 } from "lucide-react";
import { type BottleCheckResult } from "@/hooks/useOpenBottles";

interface OpenBottleDialogProps {
  open: boolean;
  /** Lista de ingredientes que necesitan botellas abiertas */
  bottleChecks: BottleCheckResult[];
  /** Callback para abrir una botella de un producto específico */
  onOpenBottle: (productId: string, labelCode?: string) => Promise<void>;
  /** Callback para continuar con el canje (todos los items suficientes) */
  onContinue: () => void;
  /** Callback para cancelar */
  onCancel: () => void;
}

/**
 * Modal que muestra el estado de botellas abiertas para los ingredientes
 * necesarios en un canje. Permite abrir botellas faltantes antes de continuar.
 */
export function OpenBottleDialog({
  open,
  bottleChecks,
  onOpenBottle,
  onContinue,
  onCancel,
}: OpenBottleDialogProps) {
  const [openingProductId, setOpeningProductId] = useState<string | null>(null);
  const [labelCodes, setLabelCodes] = useState<Record<string, string>>({});

  const allSufficient = bottleChecks.every((c) => c.sufficient);
  const insufficientItems = bottleChecks.filter((c) => !c.sufficient);

  const handleOpenBottle = async (productId: string) => {
    setOpeningProductId(productId);
    try {
      const labelCode = labelCodes[productId]?.trim() || undefined;
      await onOpenBottle(productId, labelCode);
    } finally {
      setOpeningProductId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wine className="w-5 h-5 text-primary" />
            Consumo de Botellas
          </DialogTitle>
          <DialogDescription>
            Verifica que haya botellas abiertas con ml suficientes antes de canjear.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {bottleChecks.map((check) => (
            <div
              key={check.product_id}
              className={`rounded-lg border p-3 space-y-2 ${
                check.sufficient
                  ? "border-border bg-muted/30"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {check.sufficient ? (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                  <span className="font-medium text-sm truncate">{check.product_name}</span>
                </div>
                <Badge
                  variant={check.sufficient ? "secondary" : "destructive"}
                  className="text-xs shrink-0"
                >
                  {check.required_ml} ml
                </Badge>
              </div>

              {check.sufficient ? (
                <p className="text-xs text-muted-foreground pl-6">
                  Disponible: {check.available_ml} ml
                  {check.open_bottles.length > 0 &&
                    ` · Botella${check.open_bottles.length > 1 ? "s" : ""}: ${
                      check.open_bottles
                        .filter((b) => b.label_code)
                        .map((b) => b.label_code)
                        .join(", ") || check.open_bottles.length
                    }`}
                </p>
              ) : (
                <div className="pl-6 space-y-2">
                  <p className="text-xs text-destructive">
                    Falta: {check.required_ml - check.available_ml} ml
                    {check.available_ml > 0 && ` (disponible: ${check.available_ml} ml)`}
                  </p>
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Etiqueta (ej: B1)"
                      value={labelCodes[check.product_id] || ""}
                      onChange={(e) =>
                        setLabelCodes((prev) => ({
                          ...prev,
                          [check.product_id]: e.target.value,
                        }))
                      }
                      className="h-8 text-sm max-w-[110px]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10"
                      disabled={openingProductId === check.product_id}
                      onClick={() => handleOpenBottle(check.product_id)}
                    >
                      {openingProductId === check.product_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Abrir botella"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <Separator />

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!allSufficient}
            onClick={onContinue}
          >
            {allSufficient ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Continuar canje
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                Abre las botellas faltantes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
