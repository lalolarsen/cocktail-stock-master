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

type ScanState = "idle" | "scanning" | "processing" | "success" | "error" | "manual";

// Timing constants
const COOLDOWN_MS = 5000;
const SUCCESS_DISMISS_MS = 2000;
const ERROR_DISMISS_MS = 2500;
const PROCESSING_TIMEOUT_MS = 8000;

/**
 * Universal QR token parser - handles multiple formats:
 * - Plain hex token: "9f3a1c7b6e2d4a9f"
 * - Prefixed token: "PICKUP:9f3a1c7b6e2d4a9f"
 * - URL with token query: "https://app.com/bar?token=9f3a1c7b6e2d4a9f"
 * - URL with /r/ path: "https://app.com/r/9f3a1c7b6e2d4a9f"
 * - Any URL containing hex token
 */
function parseQRToken(raw: string): { valid: boolean; token: string; error?: string } {
  const trimmed = raw.trim();
  let token = "";

  // Case A: URL with token= query param
  if (trimmed.includes("token=")) {
    const match = trimmed.match(/[?&]token=([a-f0-9]+)/i);
    if (match) token = match[1];
  }
  // Case B: URL with /r/<token> path
  else if (trimmed.includes("/r/")) {
    const match = trimmed.match(/\/r\/([a-f0-9]+)/i);
    if (match) token = match[1];
  }
  // Case C: PICKUP: prefix
  else if (trimmed.toUpperCase().startsWith("PICKUP:")) {
    token = trimmed.substring(7);
  }
  // Case D: Plain hex token - extract first hex match 12-64 chars
  else {
    const match = trimmed.match(/[a-f0-9]{12,64}/i);
    if (match) token = match[0];
  }

  // Normalize to lowercase and validate
  token = token.toLowerCase();
  
  if (token.length >= 12 && token.length <= 64 && /^[a-f0-9]+$/.test(token)) {
    return { valid: true, token };
  }

  return { valid: false, token: "", error: "QR_INVALID" };
}

/**
 * Map backend error codes to user-friendly Spanish titles
 */
function getErrorTitle(errorCode?: string): string {
  switch (errorCode) {
    case "ALREADY_REDEEMED": return "YA CANJEADO";
    case "TOKEN_EXPIRED": return "EXPIRADO";
    case "PAYMENT_NOT_CONFIRMED": return "PAGO NO CONFIRMADO";
    case "SALE_CANCELLED": return "VENTA CANCELADA";
    case "QR_INVALID": return "QR INVÁLIDO";
    case "TOKEN_NOT_FOUND": return "NO ENCONTRADO";
    case "TIMEOUT": return "TIEMPO AGOTADO";
    case "SYSTEM_ERROR": return "ERROR DE SISTEMA";
    default: return "ERROR";
  }
}

export default function Bar() {
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [manualToken, setManualToken] = useState("");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [pointOfSale, setPointOfSale] = useState<string>("");
  
  // Debug mode state (tap header 5 times to enable)
  const [debugMode, setDebugMode] = useState(false);
  const [lastRawScan, setLastRawScan] = useState("");
  const debugTapCountRef = useRef(0);
  const debugTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ token: string; timestamp: number } | null>(null);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Check cooldown for duplicate scans
  const isDuplicate = useCallback((token: string): boolean => {
    const now = Date.now();
    const storageKey = `lastScan_${token}`;
    
    // Check ref
    if (lastScannedRef.current) {
      const { token: lastToken, timestamp } = lastScannedRef.current;
      if (lastToken === token && now - timestamp < COOLDOWN_MS) {
        return true;
      }
    }
    
    // Check sessionStorage for cross-component safety
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored && now - parseInt(stored) < COOLDOWN_MS) {
        return true;
      }
      sessionStorage.setItem(storageKey, now.toString());
    } catch (e) {
      // sessionStorage not available
    }
    
    lastScannedRef.current = { token, timestamp: now };
    return false;
  }, []);

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  // Redeem token via backend
  const redeemToken = useCallback(async (token: string) => {
    clearAllTimers();
    setScanState("processing");
    setResult(null);

    // Set processing timeout fail-safe
    processingTimeoutRef.current = setTimeout(() => {
      setResult({
        success: false,
        error_code: "TIMEOUT",
        message: "Tiempo de espera agotado - reintenta",
      });
      setScanState("error");
      dismissTimerRef.current = setTimeout(() => {
        resumeScanning();
      }, ERROR_DISMISS_MS);
    }, PROCESSING_TIMEOUT_MS);

    try {
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
      });

      // Clear processing timeout since we got a response
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }

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
      // Clear processing timeout
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      
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
  }, [clearAllTimers]);

  // Handle QR scan - only process when in scanning state
  const handleScan = useCallback((decodedText: string) => {
    // Store raw scan for debug mode
    setLastRawScan(decodedText);
    
    // CRITICAL: Only process if in scanning state
    if (scanState !== "scanning") {
      return;
    }

    const parsed = parseQRToken(decodedText);
    
    if (!parsed.valid) {
      // Show quick invalid QR feedback but DON'T freeze camera
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
  }, [scanState, isDuplicate, redeemToken]);

  // Start camera scanner with mobile-optimized settings
  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;

    try {
      const scanner = new Html5Qrcode("qr-reader", { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10, // Lower FPS for better stability on mobile
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
          disableFlip: false,
          // @ts-ignore - experimentalFeatures exists but not in types
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true // Use native API when available
          }
        },
        (decodedText) => handleScan(decodedText),
        () => {} // Ignore scan errors
      );
      
      setScanState("scanning");
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

  // Resume scanner - central reset function
  const resumeScanning = useCallback(() => {
    clearAllTimers();
    setResult(null);
    setManualToken("");

    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
        setScanState("scanning");
      } catch (e) {
        // Restart if resume fails
        setScanState("idle");
        startScanner();
      }
    } else {
      setScanState("idle");
      startScanner();
    }
  }, [clearAllTimers, startScanner]);

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
    if (isVerified && scanState === "idle") {
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    }
  }, [isVerified, scanState, startScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
      stopScanner();
    };
  }, [clearAllTimers, stopScanner]);

  // Handle manual entry - uses same parseQRToken function
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = manualToken.trim();
    
    if (!input) {
      toast.error("Ingresa un código");
      return;
    }

    const parsed = parseQRToken(input);
    
    if (!parsed.valid) {
      setResult({
        success: false,
        error_code: "QR_INVALID",
        message: "Código inválido - debe ser hexadecimal de 12-64 caracteres",
      });
      setScanState("error");
      dismissTimerRef.current = setTimeout(resumeScanning, ERROR_DISMISS_MS);
      return;
    }

    if (isDuplicate(parsed.token)) {
      toast.warning("Código ya procesado recientemente");
      return;
    }

    redeemToken(parsed.token);
  };

  const switchToManual = () => {
    pauseScanner();
    setScanState("manual");
  };

  const switchToCamera = () => {
    setManualToken("");
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

  // Debug mode toggle - tap header 5 times within 2 seconds
  const handleHeaderTap = () => {
    debugTapCountRef.current++;
    
    if (debugTapTimerRef.current) {
      clearTimeout(debugTapTimerRef.current);
    }
    
    if (debugTapCountRef.current >= 5) {
      setDebugMode(prev => !prev);
      toast.info(debugMode ? "Debug mode OFF" : "Debug mode ON");
      debugTapCountRef.current = 0;
    } else {
      debugTapTimerRef.current = setTimeout(() => {
        debugTapCountRef.current = 0;
      }, 2000);
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

  // Full-screen processing state with cancel option
  if (scanState === "processing") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-24 h-24 animate-spin text-primary mb-6" />
        <h2 className="text-2xl font-bold text-foreground">Validando...</h2>
        <Button 
          variant="ghost" 
          onClick={resumeScanning}
          className="mt-8 text-muted-foreground"
        >
          Cancelar y volver a escanear
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex flex-col" onClick={handleHeaderTap}>
          <h1 className="text-lg font-bold text-primary select-none">Barra</h1>
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
        {(scanState === "scanning" || scanState === "idle") && (
          <>
            {/* Scanner viewport - takes most of the screen */}
            <div className="flex-1 relative bg-black">
              <div id="qr-reader" className="w-full h-full" />
              {/* Overlay with scanning hint */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-4 border-white/50 rounded-2xl" />
              </div>
              
              {/* Loading indicator when idle */}
              {scanState === "idle" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <Loader2 className="w-12 h-12 animate-spin text-white" />
                </div>
              )}
            </div>
            
            {/* Hint text for mobile */}
            <div className="bg-black px-4 py-2">
              <p className="text-center text-sm text-white/70">
                Sube el brillo del celular del cliente si falla la lectura
              </p>
            </div>
            
            {/* Debug panel */}
            {debugMode && lastRawScan && (
              <div className="bg-black border-t border-green-500/30 px-4 py-2">
                <p className="text-xs text-green-400 font-mono break-all">
                  RAW: {lastRawScan}
                </p>
              </div>
            )}
            
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
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Ej: 9f3a1c7b6e2d4a9f"
                  autoFocus
                  autoComplete="off"
                  inputMode="text"
                  className="h-16 text-2xl text-center font-mono tracking-wider"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Ingresa el código hexadecimal del QR
                </p>
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
