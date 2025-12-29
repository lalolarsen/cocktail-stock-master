import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, LogOut, CheckCircle2, XCircle, AlertCircle, Keyboard, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { Html5Qrcode } from "html5-qrcode";

type RedemptionResult = {
  success: boolean;
  error_code?: string;
  message: string;
  sale_number?: string;
  items?: Array<{ name: string; quantity: number }>;
  total_amount?: number;
  redeemed_at?: string;
};

type ScanState = "scanning" | "processing" | "success" | "error" | "manual";

const QR_PREFIX = "PICKUP:";
const TOKEN_MIN_LENGTH = 12;
const TOKEN_MAX_LENGTH = 20;
const COOLDOWN_MS = 5000;
const SUCCESS_DISMISS_MS = 2500;
const ERROR_DISMISS_MS = 3000;

export default function Bar() {
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [manualToken, setManualToken] = useState("");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [pointOfSale, setPointOfSale] = useState<string>("");
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ token: string; timestamp: number } | null>(null);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Fetch user info on mount
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

  // Parse QR data and extract token
  const parseQRData = useCallback((data: string): { valid: boolean; token: string; error?: string } => {
    const trimmed = data.trim().toUpperCase();
    
    if (!trimmed.startsWith(QR_PREFIX)) {
      return { valid: false, token: "", error: "QR_INVALID" };
    }
    
    const token = trimmed.substring(QR_PREFIX.length);
    
    if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
      return { valid: false, token: "", error: "QR_INVALID" };
    }
    
    // Check alphanumeric + safe chars
    if (!/^[A-Z0-9_-]+$/i.test(token)) {
      return { valid: false, token: "", error: "QR_INVALID" };
    }
    
    return { valid: true, token };
  }, []);

  // Check cooldown for duplicate scans
  const isDuplicate = useCallback((token: string): boolean => {
    const now = Date.now();
    if (lastScannedRef.current) {
      const { token: lastToken, timestamp } = lastScannedRef.current;
      if (lastToken === token && now - timestamp < COOLDOWN_MS) {
        return true;
      }
    }
    lastScannedRef.current = { token, timestamp: now };
    return false;
  }, []);

  // Redeem token via backend
  const redeemToken = useCallback(async (token: string) => {
    setScanState("processing");
    setResult(null);

    try {
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
      });

      if (error) throw error;

      const resultData = data as RedemptionResult;
      setResult(resultData);
      setScanState(resultData.success ? "success" : "error");

      // Auto-dismiss after timeout
      const timeout = resultData.success ? SUCCESS_DISMISS_MS : ERROR_DISMISS_MS;
      dismissTimerRef.current = setTimeout(() => {
        resumeScanning();
      }, timeout);
    } catch (error: any) {
      console.error("Redemption error:", error);
      setResult({
        success: false,
        error_code: "SYSTEM_ERROR",
        message: error.message || "Error al procesar el código",
      });
      setScanState("error");
      
      dismissTimerRef.current = setTimeout(() => {
        resumeScanning();
      }, ERROR_DISMISS_MS);
    }
  }, []);

  // Handle QR scan
  const handleScan = useCallback((decodedText: string) => {
    const parsed = parseQRData(decodedText);
    
    if (!parsed.valid) {
      // Show quick invalid QR feedback
      setResult({
        success: false,
        error_code: "QR_INVALID",
        message: "Código QR no válido",
      });
      setScanState("error");
      
      dismissTimerRef.current = setTimeout(() => {
        resumeScanning();
      }, ERROR_DISMISS_MS);
      return;
    }

    if (isDuplicate(parsed.token)) {
      return; // Silently ignore duplicates
    }

    // Pause scanner and process
    pauseScanner();
    redeemToken(parsed.token);
  }, [parseQRData, isDuplicate, redeemToken]);

  // Start camera scanner
  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;

    try {
      const scanner = new Html5Qrcode("qr-reader", { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1,
          disableFlip: false,
        },
        (decodedText) => handleScan(decodedText),
        () => {} // Ignore scan errors
      );
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("No se pudo acceder a la cámara");
      setScanState("manual");
    }
  }, [handleScan]);

  // Pause scanner (don't destroy, just pause)
  const pauseScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.pause(true);
      } catch (e) {
        // Scanner might not be running
      }
    }
  }, []);

  // Resume scanner
  const resumeScanning = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    
    setResult(null);
    setManualToken("");
    setScanState("scanning");

    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch (e) {
        // Restart if resume fails
        startScanner();
      }
    } else {
      startScanner();
    }
  }, [startScanner]);

  // Stop scanner completely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        // Already stopped
      }
    }
  }, []);

  // Initialize scanner on mount
  useEffect(() => {
    if (isVerified && scanState === "scanning") {
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    }
  }, [isVerified, startScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      stopScanner();
    };
  }, [stopScanner]);

  // Handle manual entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = manualToken.trim().toUpperCase();
    
    if (!input) {
      toast.error("Ingresa un código");
      return;
    }

    // Try with prefix first, then without
    let tokenToRedeem = input;
    if (!input.startsWith(QR_PREFIX)) {
      // Assume user entered just the token
      if (input.length >= TOKEN_MIN_LENGTH && input.length <= TOKEN_MAX_LENGTH) {
        tokenToRedeem = input;
      } else {
        setResult({
          success: false,
          error_code: "QR_INVALID",
          message: "Código inválido",
        });
        setScanState("error");
        dismissTimerRef.current = setTimeout(resumeScanning, ERROR_DISMISS_MS);
        return;
      }
    } else {
      tokenToRedeem = input.substring(QR_PREFIX.length);
    }

    if (isDuplicate(tokenToRedeem)) {
      toast.warning("Código ya procesado recientemente");
      return;
    }

    redeemToken(tokenToRedeem);
  };

  const switchToManual = () => {
    pauseScanner();
    setScanState("manual");
  };

  const switchToCamera = () => {
    setManualToken("");
    setScanState("scanning");
    resumeScanning();
  };

  const handleLogout = async () => {
    await stopScanner();
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

  const getItemCount = () => {
    if (!result?.items) return 0;
    return result.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getErrorTitle = (errorCode?: string) => {
    switch (errorCode) {
      case "ALREADY_REDEEMED": return "YA CANJEADO";
      case "TOKEN_EXPIRED": return "EXPIRADO";
      case "PAYMENT_NOT_CONFIRMED": return "PAGO NO CONFIRMADO";
      case "SALE_CANCELLED": return "VENTA CANCELADA";
      case "QR_INVALID": return "QR INVÁLIDO";
      case "TOKEN_NOT_FOUND": return "NO ENCONTRADO";
      default: return "ERROR";
    }
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <WorkerPinDialog
          open={showPinDialog}
          onVerified={handlePinVerified}
          onCancel={handlePinCancel}
        />
      </div>
    );
  }

  // Full-screen success state
  if (scanState === "success" && result?.success) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-green-600 text-white p-6 cursor-pointer"
        onClick={resumeScanning}
      >
        <CheckCircle2 className="w-32 h-32 mb-6 animate-pulse" />
        <h1 className="text-5xl font-black mb-4 tracking-tight">ENTREGADO</h1>
        <p className="text-3xl font-bold mb-2">{result.sale_number}</p>
        <p className="text-2xl opacity-90">{getItemCount()} {getItemCount() === 1 ? "item" : "items"}</p>
        <p className="mt-8 text-lg opacity-70">Toca para continuar</p>
      </div>
    );
  }

  // Full-screen error state
  if (scanState === "error" && result) {
    const isWarning = result.error_code === "ALREADY_REDEEMED";
    return (
      <div 
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 cursor-pointer ${
          isWarning ? "bg-yellow-500 text-black" : "bg-red-600 text-white"
        }`}
        onClick={resumeScanning}
      >
        {isWarning ? (
          <AlertCircle className="w-32 h-32 mb-6" />
        ) : (
          <XCircle className="w-32 h-32 mb-6" />
        )}
        <h1 className="text-4xl font-black mb-4 tracking-tight text-center">
          {getErrorTitle(result.error_code)}
        </h1>
        <p className="text-xl opacity-90 text-center max-w-sm">{result.message}</p>
        <p className="mt-8 text-lg opacity-70">Toca para continuar</p>
      </div>
    );
  }

  // Full-screen processing state
  if (scanState === "processing") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-24 h-24 animate-spin text-primary mb-6" />
        <h2 className="text-2xl font-bold text-foreground">Validando...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold text-primary">Barra</h1>
          {(userName || pointOfSale) && (
            <p className="text-xs text-muted-foreground">
              {userName}{userName && pointOfSale && " • "}{pointOfSale}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {scanState === "scanning" && (
          <>
            {/* Scanner viewport - takes most of the screen */}
            <div className="flex-1 relative bg-black">
              <div id="qr-reader" className="w-full h-full" />
              {/* Overlay with scanning hint */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-72 h-72 border-4 border-white/50 rounded-2xl" />
              </div>
            </div>
            
            {/* Manual entry button */}
            <div className="p-4 bg-card border-t border-border">
              <Button 
                variant="outline" 
                onClick={switchToManual} 
                className="w-full h-14 text-lg"
              >
                <Keyboard className="w-5 h-5 mr-2" />
                Ingresar Código Manual
              </Button>
            </div>
          </>
        )}

        {scanState === "manual" && (
          <div className="flex-1 flex flex-col p-6">
            <form onSubmit={handleManualSubmit} className="flex-1 flex flex-col gap-6">
              <div className="flex-1 flex flex-col justify-center">
                <label className="text-lg font-semibold mb-3 text-foreground">
                  Código de Retiro
                </label>
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value.toUpperCase())}
                  placeholder="Ej: ABC123XYZ456"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  inputMode="text"
                  className="h-16 text-2xl text-center font-mono tracking-wider uppercase"
                />
              </div>
              
              <div className="space-y-3">
                <Button 
                  type="submit" 
                  className="w-full h-16 text-xl font-bold"
                  disabled={!manualToken.trim()}
                >
                  Validar Código
                </Button>
                <Button 
                  type="button"
                  variant="outline"
                  onClick={switchToCamera}
                  className="w-full h-14 text-lg"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Volver a Cámara
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
