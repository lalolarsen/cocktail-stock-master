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
import PickupQRDialog from "@/components/PickupQRDialog";

type WizardStep = "processing" | "deliver" | "error";

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
  const [step, setStep] = useState<WizardStep>("processing");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showReprintQR, setShowReprintQR] = useState(false);

  // Auto-redeem on mount
  useEffect(() => {
    executeAutoRedeem();
  }, [saleId]);

  // Execute auto-redeem
  const executeAutoRedeem = async () => {
    setStep("processing");
    setIsRedeeming(true);

    try {
      const { data, error } = await supabase.rpc("auto_redeem_sale_token", {
        p_sale_id: saleId,
        p_bar_location_id: barLocationId,
        p_seller_id: sellerId,
        p_mixer_overrides: null,
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
        setStep("deliver");
      } else {
        setErrorMessage(result.message || result.error || "Error al ejecutar auto-canje.");
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

  // ═══ STEP: Processing auto-redeem ═══
  if (step === "processing") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Loader2 className="w-20 h-20 animate-spin text-primary mb-6" />
        <h2 className="text-3xl font-bold text-foreground">Procesando canje...</h2>
        <p className="text-muted-foreground mt-2">Registrando entrega en {barName}</p>
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
            shortCode={pickupShortCode}
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
          shortCode={pickupShortCode}
        />
      )}
    </div>
  );
}
