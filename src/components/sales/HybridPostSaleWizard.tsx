import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCLP } from "@/lib/currency";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  MapPin,
  QrCode,
  GlassWater,
  Check,
  Package,
  ArrowRight,
} from "lucide-react";
import { MixerSelectionDialog, type MixerSlot } from "@/components/bar/MixerSelectionDialog";
import PickupQRDialog from "@/components/PickupQRDialog";

type WizardStep = "checking_mixer" | "mixer_selection" | "processing" | "deliver" | "error";

interface CartItemInfo {
  name: string;
  quantity: number;
  price: number;
}

interface HybridPostSaleWizardProps {
  saleId: string;
  saleNumber: string;
  total: number;
  items: CartItemInfo[];
  barLocationId: string;
  barName: string;
  sellerId: string;
  venueId?: string;
  pickupToken?: string;
  pickupExpiresAt?: string;
  pickupShortCode?: string;
  onComplete: () => void;
}

export function HybridPostSaleWizard({
  saleId,
  saleNumber,
  total,
  items,
  barLocationId,
  barName,
  sellerId,
  venueId = "",
  pickupToken,
  pickupExpiresAt,
  pickupShortCode,
  onComplete,
}: HybridPostSaleWizardProps) {
  const [step, setStep] = useState<WizardStep>("checking_mixer");
  const [mixerSlots, setMixerSlots] = useState<MixerSlot[]>([]);
  const [mixerSelections, setMixerSelections] = useState<{ slot_index: number; product_id: string }[] | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [missingItems, setMissingItems] = useState<Array<{ product_name: string; required: number; available: number; unit: string }>>([]);
  const [consumedIngredients, setConsumedIngredients] = useState<Array<{ product_name: string; quantity: number }>>([]);
  const [showReprintQR, setShowReprintQR] = useState(false);

  // Step 1: Check if mixer selection is needed
  useEffect(() => {
    checkMixerRequirements();
  }, [saleId]);

  const checkMixerRequirements = async () => {
    try {
      const { data, error } = await supabase.rpc("check_sale_mixer_requirements", {
        p_sale_id: saleId,
      });

      if (error) throw error;

      const result = data as unknown as { success: boolean; requires_mixer: boolean; mixer_slots?: MixerSlot[] };

      if (result.success && result.requires_mixer && result.mixer_slots && result.mixer_slots.length > 0) {
        setMixerSlots(result.mixer_slots);
        setStep("mixer_selection");
      } else {
        // No mixer needed, go straight to auto-redeem
        executeAutoRedeem(null);
      }
    } catch (err: any) {
      console.error("Mixer check error:", err);
      // If check fails, proceed without mixer (non-blocking)
      executeAutoRedeem(null);
    }
  };

  // Handle mixer confirmation
  const handleMixerConfirm = useCallback((selections: { slot_index: number; product_id: string }[]) => {
    setMixerSelections(selections);
    executeAutoRedeem(selections);
  }, [saleId, barLocationId, sellerId]);

  // Handle mixer cancel - proceed without mixer override
  const handleMixerCancel = useCallback(() => {
    executeAutoRedeem(null);
  }, [saleId, barLocationId, sellerId]);

  // Execute auto-redeem
  const executeAutoRedeem = async (overrides: { slot_index: number; product_id: string }[] | null) => {
    setStep("processing");
    setIsRedeeming(true);

    try {
      const { data, error } = await supabase.rpc("auto_redeem_sale_token", {
        p_sale_id: saleId,
        p_bar_location_id: barLocationId,
        p_seller_id: sellerId,
        p_mixer_overrides: overrides || null,
      });

      if (error) throw error;

      const result = data as {
        success: boolean;
        error?: string;
        message?: string;
        bar_name?: string;
        items?: Array<{ name: string; quantity: number }>;
        consumed?: Array<{ product_name: string; quantity: number }>;
        missing_items?: Array<{ product_name: string; required: number; available: number; unit: string }>;
      };

      if (result.success) {
        setConsumedIngredients(result.consumed || []);
        setStep("deliver");
      } else if (result.error === "stock_insufficient") {
        setErrorMessage("Stock insuficiente para auto-canje. El QR queda pendiente para canje manual en barra.");
        setMissingItems(result.missing_items || []);
        setStep("error");
      } else {
        setErrorMessage(result.message || "Error al ejecutar auto-canje.");
        setStep("error");
      }
    } catch (err: any) {
      console.error("Auto-redeem error:", err);
      setErrorMessage(err.message || "Error inesperado al ejecutar auto-canje.");
      setStep("error");
    } finally {
      setIsRedeeming(false);
    }
  };

  // ═══ STEP: Checking mixer requirements ═══
  if (step === "checking_mixer") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Loader2 className="w-16 h-16 animate-spin text-primary mb-6" />
        <h2 className="text-2xl font-bold text-foreground">Preparando auto-canje...</h2>
        <p className="text-muted-foreground mt-2">Verificando si requiere selección de mixer</p>
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" />
          <span>Descuenta desde: <span className="font-medium text-foreground">{barName}</span></span>
        </div>
      </div>
    );
  }

  // ═══ STEP: Mixer Selection ═══
  if (step === "mixer_selection" && mixerSlots.length > 0) {
    return (
      <MixerSelectionDialog
        mixerSlots={mixerSlots}
        locationId={barLocationId}
        venueId={venueId}
        onConfirm={handleMixerConfirm}
        onCancel={handleMixerCancel}
        isLoading={isRedeeming}
      />
    );
  }

  // ═══ STEP: Processing auto-redeem ═══
  if (step === "processing") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Loader2 className="w-20 h-20 animate-spin text-primary mb-6" />
        <h2 className="text-3xl font-bold text-foreground">Procesando canje...</h2>
        <p className="text-muted-foreground mt-2">Descontando stock de {barName}</p>
        <Badge variant="outline" className="mt-4 text-sm border-amber-500/40 text-amber-600 bg-amber-500/10">
          Híbrido · Auto-canje
        </Badge>
      </div>
    );
  }

  // ═══ STEP: Error ═══
  if (step === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="w-20 h-20 mx-auto bg-destructive/15 rounded-full flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Auto-canje no completado</h1>
            <p className="text-muted-foreground">{errorMessage}</p>
          </div>

          {missingItems.length > 0 && (
            <Card className="p-4 text-left">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Stock faltante:</h3>
              <div className="space-y-1.5">
                {missingItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.product_name}</span>
                    <span className="font-mono text-destructive">
                      {item.available}/{item.required} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 bg-amber-500/10 border-amber-500/30">
            <p className="text-sm text-amber-700 font-medium">
              La venta fue creada correctamente. El QR queda pendiente y se puede canjear manualmente en cualquier barra.
            </p>
          </Card>

          <div className="space-y-3">
            {pickupToken && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowReprintQR(true)}
              >
                <QrCode className="w-4 h-4" />
                Reimprimir QR para canje manual
              </Button>
            )}
            <Button onClick={onComplete} className="w-full text-lg py-5" size="lg">
              Listo — Nueva venta
            </Button>
          </div>
        </div>

        {/* QR reprint dialog */}
        {showReprintQR && pickupToken && (
          <PickupQRDialog
            open={showReprintQR}
            onClose={() => setShowReprintQR(false)}
            token={pickupToken}
            saleNumber={saleNumber}
            expiresAt={pickupExpiresAt || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()}
            items={items}
            total={total}
          />
        )}
      </div>
    );
  }

  // ═══ STEP: Deliver (success) ═══
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Persistent hybrid badge header */}
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-[11px]">
            Híbrido
          </Badge>
          <span className="text-muted-foreground">
            Descuenta desde: <span className="font-medium text-foreground">{barName}</span>
          </span>
        </div>
        <Badge variant="default" className="bg-green-600/90 text-[11px]">
          <Check className="w-3 h-3 mr-1" />
          Canjeado
        </Badge>
      </div>

      {/* Main delivery content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          {/* Success icon */}
          <div className="w-24 h-24 mx-auto bg-green-600/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-14 h-14 text-green-600" />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-black tracking-tight text-foreground">ENTREGAR</h1>

          {/* Sale number */}
          <p className="text-lg font-mono font-bold text-primary">{saleNumber}</p>

          {/* Items to deliver */}
          <Card className="p-5 text-left">
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-lg">{item.name}</p>
                    {item.price > 0 && (
                      <p className="text-sm text-muted-foreground">{formatCLP(item.price)}</p>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-primary">x{item.quantity}</span>
                </div>
              ))}
            </div>

            {/* Mixer selection display */}
            {mixerSelections && mixerSelections.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <GlassWater className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-muted-foreground">Mixer elegido</span>
                </div>
                {mixerSelections.map((sel, idx) => {
                  const slot = mixerSlots.find(s => s.slot_index === sel.slot_index);
                  const option = slot?.available_options.find(o => o.id === sel.product_id);
                  return (
                    <div key={idx} className="flex items-center gap-2 text-sm ml-6">
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{option?.name || slot?.default_product_name || "Mixer"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Bar info */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>Stock descontado de <span className="font-medium text-foreground">{barName}</span></span>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between px-4 py-3 bg-muted/50 rounded-lg">
            <span className="text-muted-foreground font-medium">Total</span>
            <span className="text-2xl font-bold text-foreground">{formatCLP(total)}</span>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <Button onClick={onComplete} className="w-full text-lg py-6" size="lg">
              Listo — Nueva venta
            </Button>

            {pickupToken && (
              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground"
                onClick={() => setShowReprintQR(true)}
              >
                <QrCode className="w-4 h-4" />
                Reimprimir comprobante QR
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* QR reprint dialog */}
      {showReprintQR && pickupToken && (
        <PickupQRDialog
          open={showReprintQR}
          onClose={() => setShowReprintQR(false)}
          token={pickupToken}
          saleNumber={saleNumber}
          expiresAt={pickupExpiresAt || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()}
          items={items}
          total={total}
          barName={barName}
        />
      )}
    </div>
  );
}
