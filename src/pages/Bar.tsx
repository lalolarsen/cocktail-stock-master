import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, LogOut, QrCode, CheckCircle2, XCircle, AlertCircle, Keyboard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCLP } from "@/lib/currency";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { Html5QrcodeScanner } from "html5-qrcode";

type RedemptionResult = {
  success: boolean;
  error_code?: string;
  message: string;
  sale_number?: string;
  items?: Array<{ name: string; quantity: number }>;
  total_amount?: number;
  redeemed_at?: string;
};

export default function Bar() {
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [pointOfSale, setPointOfSale] = useState<string>("");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, point_of_sale")
          .eq("id", user.id)
          .single();
        if (profile) {
          setUserName(profile.full_name || "");
          setPointOfSale(profile.point_of_sale || "");
        }
      }
    };
    fetchUserInfo();
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, []);

  const startScanner = () => {
    setScanning(true);
    setResult(null);
    setManualMode(false);

    setTimeout(() => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }

      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scannerRef.current.render(
        (decodedText) => {
          if (scannerRef.current) {
            scannerRef.current.clear().catch(console.error);
          }
          setScanning(false);
          redeemToken(decodedText);
        },
        (errorMessage) => {
          // Ignore scan errors
        }
      );
    }, 100);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(console.error);
    }
    setScanning(false);
  };

  const redeemToken = async (token: string) => {
    if (!token.trim()) {
      toast.error("Ingresa un código válido");
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token.trim(),
      });

      if (error) throw error;

      const resultData = data as RedemptionResult;
      setResult(resultData);

      if (resultData.success) {
        toast.success("¡Entregado correctamente!");
      } else {
        toast.error(resultData.message);
      }
    } catch (error: any) {
      console.error("Redemption error:", error);
      setResult({
        success: false,
        error_code: "SYSTEM_ERROR",
        message: error.message || "Error al procesar el código",
      });
      toast.error("Error al procesar el código");
    } finally {
      setProcessing(false);
      setManualToken("");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    redeemToken(manualToken);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handlePinVerified = () => {
    setIsVerified(true);
    setShowPinDialog(false);
  };

  const handlePinCancel = () => {
    void (async () => {
      await supabase.auth.signOut();
      window.location.assign("/auth");
    })();
  };

  const resetState = () => {
    setResult(null);
    setManualToken("");
    setManualMode(false);
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <WorkerPinDialog
          open={showPinDialog}
          onVerified={handlePinVerified}
          onCancel={handlePinCancel}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/10 via-background to-purple-600/5 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-purple-500">Portal Barra</h1>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
          {(userName || pointOfSale) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {userName && <span className="font-medium">{userName}</span>}
              {userName && pointOfSale && <span>•</span>}
              {pointOfSale && <span>{pointOfSale}</span>}
            </div>
          )}
        </div>

        {/* Result Display */}
        {result && (
          <Card className={`p-6 ${result.success ? "border-green-500 bg-green-500/10" : "border-destructive bg-destructive/10"}`}>
            <div className="text-center space-y-4">
              {result.success ? (
                <>
                  <CheckCircle2 className="w-20 h-20 mx-auto text-green-500" />
                  <h2 className="text-3xl font-bold text-green-500">ENTREGADO</h2>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">{result.sale_number}</p>
                    <div className="space-y-1">
                      {result.items?.map((item, index) => (
                        <p key={index} className="text-muted-foreground">
                          {item.quantity}x {item.name}
                        </p>
                      ))}
                    </div>
                    <p className="text-xl font-bold text-primary">
                      {formatCLP(result.total_amount || 0)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {result.error_code === "ALREADY_REDEEMED" ? (
                    <AlertCircle className="w-20 h-20 mx-auto text-yellow-500" />
                  ) : (
                    <XCircle className="w-20 h-20 mx-auto text-destructive" />
                  )}
                  <h2 className="text-2xl font-bold text-destructive">
                    {result.error_code === "ALREADY_REDEEMED"
                      ? "YA CANJEADO"
                      : result.error_code === "TOKEN_EXPIRED"
                      ? "EXPIRADO"
                      : result.error_code === "PAYMENT_NOT_CONFIRMED"
                      ? "PAGO NO CONFIRMADO"
                      : result.error_code === "SALE_CANCELLED"
                      ? "VENTA CANCELADA"
                      : "ERROR"}
                  </h2>
                  <p className="text-muted-foreground">{result.message}</p>
                </>
              )}
              <Button onClick={resetState} size="lg" className="w-full mt-4">
                Escanear Otro
              </Button>
            </div>
          </Card>
        )}

        {/* Scanner UI */}
        {!result && !processing && (
          <Card className="p-6">
            {scanning ? (
              <div className="space-y-4">
                <div id="qr-reader" className="w-full" />
                <Button variant="outline" onClick={stopScanner} className="w-full">
                  Cancelar
                </Button>
              </div>
            ) : manualMode ? (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Código de Retiro</label>
                  <Input
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Ingresa el código..."
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setManualMode(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={!manualToken.trim()}>
                    Validar
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <QrCode className="w-24 h-24 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Escanea el código QR del cliente
                  </p>
                </div>
                <Button onClick={startScanner} size="lg" className="w-full">
                  <QrCode className="w-5 h-5 mr-2" />
                  Iniciar Escaneo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setManualMode(true)}
                  className="w-full"
                >
                  <Keyboard className="w-5 h-5 mr-2" />
                  Ingresar Código Manual
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Processing State */}
        {processing && (
          <Card className="p-6">
            <div className="text-center py-8">
              <Loader2 className="w-16 h-16 mx-auto animate-spin text-primary" />
              <p className="mt-4 text-muted-foreground">Validando código...</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
