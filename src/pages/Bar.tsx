import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, LogOut, CheckCircle2, XCircle, AlertCircle, Keyboard, Camera, RefreshCw } from "lucide-react";
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

// Explicit scan lifecycle states
type ScanState = "idle" | "processing" | "success" | "error" | "manual";

// Timing constants
const COOLDOWN_MS = 5000;
const SUCCESS_DISMISS_MS = 1800;
const ERROR_DISMISS_MS = 2200;
const PROCESSING_TIMEOUT_MS = 8000;

/**
 * Universal QR token parser - handles multiple formats:
 * - Plain hex token: "9f3a1c7b6e2d4a9f"
 * - Prefixed token: "PICKUP:9f3a1c7b6e2d4a9f"
 * - URL with token query: "https://app.com/bar?token=9f3a1c7b6e2d4a9f"
 * - URL with /r/ path: "https://app.com/r/9f3a1c7b6e2d4a9f"
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
  const [scannerReady, setScannerReady] = useState(false);
  
  // Debug mode state (tap header 5 times to enable)
  const [debugMode, setDebugMode] = useState(false);
  const [lastRawScan, setLastRawScan] = useState("");
  const [lastParsedToken, setLastParsedToken] = useState("");
  const debugTapCountRef = useRef(0);
  const debugTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Scanner and state refs - CRITICAL: use refs to avoid stale closures
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanStateRef = useRef<ScanState>("idle");
  const lastTokenRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Keep ref in sync with state
  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

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

  // Pause scanner stream
  const pauseScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.pause(true);
      } catch (e) {
        // Scanner might not be running
      }
    }
  }, []);

  // Resume scanner stream
  const resumeScannerStream = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch (e) {
        // Scanner might not be paused
      }
    }
  }, []);

  // Reset to idle and resume scanning - THE central reset function
  const resetToIdle = useCallback(() => {
    clearAllTimers();
    setResult(null);
    setScanState("idle");
    resumeScannerStream();
  }, [clearAllTimers, resumeScannerStream]);

  // Redeem token via backend
  const processToken = useCallback(async (token: string) => {
    // Update cooldown refs BEFORE state change
    lastTokenRef.current = token;
    lastScanTimeRef.current = Date.now();
    
    // Pause scanner and switch to processing
    pauseScanner();
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
      dismissTimerRef.current = setTimeout(resetToIdle, ERROR_DISMISS_MS);
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
      dismissTimerRef.current = setTimeout(resetToIdle, timeout);
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
      
      dismissTimerRef.current = setTimeout(resetToIdle, ERROR_DISMISS_MS);
    }
  }, [pauseScanner, clearAllTimers, resetToIdle]);

  // Start camera scanner - callback uses refs to avoid stale closures
  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;

    try {
      const scanner = new Html5Qrcode("qr-reader", { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 8,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
          disableFlip: false,
        },
        (decodedText) => {
          // CRITICAL: Use refs instead of state to avoid stale closures
          const currentState = scanStateRef.current;
          
          // STATE GATE: Only process when idle
          if (currentState !== "idle") {
            return;
          }
          
          const now = Date.now();
          const parsed = parseQRToken(decodedText);
          
          // Store for debug display
          setLastRawScan(decodedText);
          setLastParsedToken(parsed.token || "(inválido)");
          
          if (!parsed.valid) {
            // Invalid QR - show error briefly
            setScanState("error");
            setResult({
              success: false,
              error_code: "QR_INVALID",
              message: "Código QR no válido",
            });
            // Pause during error display
            if (scannerRef.current) {
              try { scannerRef.current.pause(true); } catch {}
            }
            dismissTimerRef.current = setTimeout(() => {
              setResult(null);
              setScanState("idle");
              if (scannerRef.current) {
                try { scannerRef.current.resume(); } catch {}
              }
            }, ERROR_DISMISS_MS);
            return;
          }

          // COOLDOWN: Check if same token within cooldown period
          if (parsed.token === lastTokenRef.current && 
              now - lastScanTimeRef.current < COOLDOWN_MS) {
            // Silently ignore duplicate
            return;
          }

          // PROCESS: Valid new token
          // Update cooldown tracking
          lastTokenRef.current = parsed.token;
          lastScanTimeRef.current = now;
          
          // Pause scanner immediately
          if (scannerRef.current) {
            try { scannerRef.current.pause(true); } catch {}
          }
          
          // Process the token
          setScanState("processing");
          setResult(null);

          // Set processing timeout
          processingTimeoutRef.current = setTimeout(() => {
            setResult({
              success: false,
              error_code: "TIMEOUT",
              message: "Tiempo de espera agotado",
            });
            setScanState("error");
            dismissTimerRef.current = setTimeout(() => {
              setResult(null);
              setScanState("idle");
              if (scannerRef.current) {
                try { scannerRef.current.resume(); } catch {}
              }
            }, ERROR_DISMISS_MS);
          }, PROCESSING_TIMEOUT_MS);

          // Call backend
          (async () => {
            try {
              const { data, error } = await supabase.rpc("redeem_pickup_token", { p_token: parsed.token });
              
              if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
                processingTimeoutRef.current = null;
              }

              if (error) {
                setResult({
                  success: false,
                  error_code: "SYSTEM_ERROR",
                  message: error.message || "Error de sistema",
                });
                setScanState("error");
              } else {
                const resData = data as RedemptionResult;
                setResult(resData);
                setScanState(resData.success ? "success" : "error");
              }

              // Auto-dismiss
              const timeout = (data as RedemptionResult)?.success ? SUCCESS_DISMISS_MS : ERROR_DISMISS_MS;
              dismissTimerRef.current = setTimeout(() => {
                setResult(null);
                setScanState("idle");
                if (scannerRef.current) {
                  try { scannerRef.current.resume(); } catch {}
                }
              }, timeout);
            } catch (err: any) {
              if (processingTimeoutRef.current) {
                clearTimeout(processingTimeoutRef.current);
                processingTimeoutRef.current = null;
              }
              setResult({
                success: false,
                error_code: "SYSTEM_ERROR",
                message: err.message || "Error de conexión",
              });
              setScanState("error");
              dismissTimerRef.current = setTimeout(() => {
                setResult(null);
                setScanState("idle");
                if (scannerRef.current) {
                  try { scannerRef.current.resume(); } catch {}
                }
              }, ERROR_DISMISS_MS);
            }
          })();
        },
        () => {} // Ignore scan errors
      );
      
      setScannerReady(true);
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("No se pudo acceder a la cámara");
      setScanState("manual");
    }
  }, []);

  // Stop scanner completely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        setScannerReady(false);
      } catch (e) {
        // Already stopped
      }
    }
  }, []);

  // Initialize scanner on mount
  useEffect(() => {
    if (isVerified && scanState === "idle" && !scannerRef.current) {
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    }
  }, [isVerified, startScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
      stopScanner();
    };
  }, [clearAllTimers, stopScanner]);

  // Handle manual entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = manualToken.trim();
    
    if (!input) {
      toast.error("Ingresa un código");
      return;
    }

    const parsed = parseQRToken(input);
    setLastParsedToken(parsed.token || "(inválido)");
    
    if (!parsed.valid) {
      setResult({
        success: false,
        error_code: "QR_INVALID",
        message: "Código inválido - debe ser hexadecimal de 12-64 caracteres",
      });
      setScanState("error");
      dismissTimerRef.current = setTimeout(resetToIdle, ERROR_DISMISS_MS);
      return;
    }

    // Check cooldown for manual entry too
    const now = Date.now();
    if (parsed.token === lastTokenRef.current && 
        now - lastScanTimeRef.current < COOLDOWN_MS) {
      toast.warning("Código ya procesado recientemente");
      return;
    }

    processToken(parsed.token);
  };

  const switchToManual = () => {
    pauseScanner();
    setScanState("manual");
  };

  const switchToCamera = () => {
    setManualToken("");
    resetToIdle();
  };

  // Manual reset - clear everything and resume
  const handleManualReset = () => {
    clearAllTimers();
    setResult(null);
    setLastRawScan("");
    setLastParsedToken("");
    lastTokenRef.current = "";
    lastScanTimeRef.current = 0;
    setScanState("idle");
    resumeScannerStream();
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
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-green-600 text-white p-6"
        onClick={handleManualReset}
      >
        <CheckCircle2 className="w-32 h-32 mb-6 animate-pulse" />
        <h1 className="text-5xl font-black mb-4 tracking-tight">ENTREGADO</h1>
        <p className="text-3xl font-bold mb-2">{result.sale_number}</p>
        <p className="text-2xl opacity-90">{getItemCount()} {getItemCount() === 1 ? "item" : "items"}</p>
        
        <Button 
          onClick={(e) => { e.stopPropagation(); handleManualReset(); }}
          variant="secondary"
          className="mt-8 h-14 px-8 text-lg font-bold bg-white/20 hover:bg-white/30 text-white border-0"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Escanear Siguiente
        </Button>
        
        <p className="mt-4 text-sm opacity-60">Auto-cierre en {SUCCESS_DISMISS_MS/1000}s</p>
      </div>
    );
  }

  // Full-screen error state
  if (scanState === "error" && result) {
    const isWarning = result.error_code === "ALREADY_REDEEMED";
    return (
      <div 
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${
          isWarning ? "bg-yellow-500 text-black" : "bg-red-600 text-white"
        }`}
        onClick={handleManualReset}
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
        
        {/* Debug info on error */}
        {debugMode && (
          <div className="mt-4 p-3 bg-black/20 rounded-lg max-w-sm w-full">
            <p className="text-xs font-mono break-all opacity-80">
              RAW: {lastRawScan || "(none)"}
            </p>
            <p className="text-xs font-mono break-all opacity-80">
              PARSED: {lastParsedToken || "(none)"}
            </p>
          </div>
        )}
        
        <Button 
          onClick={(e) => { e.stopPropagation(); handleManualReset(); }}
          variant="secondary"
          className={`mt-8 h-14 px-8 text-lg font-bold border-0 ${
            isWarning ? "bg-black/20 hover:bg-black/30 text-black" : "bg-white/20 hover:bg-white/30 text-white"
          }`}
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Escanear Siguiente
        </Button>
        
        <p className="mt-4 text-sm opacity-60">Auto-cierre en {ERROR_DISMISS_MS/1000}s</p>
      </div>
    );
  }

  // Full-screen processing state
  if (scanState === "processing") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-24 h-24 animate-spin text-primary mb-6" />
        <h2 className="text-2xl font-bold text-foreground">Validando...</h2>
        
        {debugMode && lastParsedToken && (
          <p className="mt-4 text-xs text-muted-foreground font-mono">
            Token: {lastParsedToken.slice(0, 8)}...
          </p>
        )}
        
        <Button 
          variant="ghost" 
          onClick={handleManualReset}
          className="mt-8 text-muted-foreground"
        >
          Cancelar
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
        {scanState === "idle" && (
          <>
            {/* Scanner viewport */}
            <div className="flex-1 relative bg-black">
              <div id="qr-reader" className="w-full h-full" />
              
              {/* Overlay with scanning hint */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-4 border-white/50 rounded-2xl" />
              </div>
              
              {/* Status indicator */}
              <div className="absolute top-4 left-0 right-0 flex justify-center">
                <div className="bg-green-500/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Listo para escanear
                </div>
              </div>
              
              {/* Loading indicator when scanner not ready */}
              {!scannerReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <Loader2 className="w-12 h-12 animate-spin text-white" />
                </div>
              )}
            </div>
            
            {/* Hint text */}
            <div className="bg-black px-4 py-2">
              <p className="text-center text-sm text-white/70">
                Sube el brillo del celular del cliente si falla la lectura
              </p>
            </div>
            
            {/* Enhanced Debug panel */}
            {debugMode && (
              <div className="bg-black border-t border-green-500/30 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-400 font-semibold">DEBUG MODE</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-green-400 hover:text-green-300"
                    onClick={() => {
                      const debugText = `RAW: ${lastRawScan || "(none)"}\nPARSED: ${lastParsedToken || "(none)"}\nLAST_TOKEN_REF: ${lastTokenRef.current || "(none)"}\nCOOLDOWN_REMAINING: ${Math.max(0, COOLDOWN_MS - (Date.now() - lastScanTimeRef.current))}ms`;
                      navigator.clipboard.writeText(debugText);
                      toast.success("Debug info copiado");
                    }}
                  >
                    Copiar Debug
                  </Button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-green-400/80 font-mono break-all">
                    <span className="text-green-500">RAW:</span> {lastRawScan || "(esperando escaneo)"}
                  </p>
                  <p className="text-xs text-green-400/80 font-mono break-all">
                    <span className="text-green-500">PARSED:</span> {lastParsedToken || "(ninguno)"}
                  </p>
                  <p className="text-xs text-green-400/80 font-mono">
                    <span className="text-green-500">STATE:</span> {scanState} | 
                    <span className="text-green-500"> READY:</span> {scannerReady ? "yes" : "no"}
                  </p>
                </div>
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
