import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogOut, CheckCircle2, XCircle, AlertCircle, Keyboard, Camera, RefreshCw, MapPin, Package, Clock, Trash2, RotateCcw, ScanLine, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { DemoWatermark } from "@/components/DemoWatermark";
import { useDemoMode } from "@/hooks/useDemoMode";
import { Html5Qrcode } from "html5-qrcode";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { RedemptionHistory } from "@/components/bar/RedemptionHistory";
import { useIsMobile } from "@/hooks/use-mobile";
import { logAuditEvent } from "@/lib/monitoring";

type MissingItem = {
  product_name: string;
  required_qty: number;
  unit: string;
};

type DeliverItem = {
  name: string;
  quantity: number;
};

type DeliverInfo = {
  type: "cover" | "menu_items";
  name?: string;
  quantity?: number;
  items?: DeliverItem[];
  source: "sale" | "ticket";
  sale_number?: string;
  ticket_number?: string;
};

type RedemptionResult = {
  success: boolean;
  error_code?: string;
  message: string;
  deliver?: DeliverInfo;
  sale_number?: string;
  total_amount?: number;
  redeemed_at?: string;
  previously_redeemed_at?: string;
  bar_location?: { id: string; name: string };
  bar_name?: string;
  missing?: MissingItem[];
};

type BarLocation = {
  id: string;
  name: string;
  type: string;
};

// Explicit scan lifecycle states
type ScanState = "idle" | "processing" | "success" | "error";

// Timing constants
const COOLDOWN_MS = 2500; // 2.5 seconds duplicate suppression
const SUCCESS_DISMISS_MS = 1800; // 1.8s display for success
const USED_DISMISS_MS = 2000; // 2s display for already used
const ERROR_DISMISS_MS = 2000; // 2s display for errors
const INSUFFICIENT_STOCK_DISMISS_MS = 3000; // 3s for insufficient stock
const PROCESSING_TIMEOUT_MS = 8000;

/**
 * Universal QR token parser - handles multiple formats
 */
function parseQRToken(raw: string): { valid: boolean; token: string; error?: string } {
  const trimmed = raw.trim();
  let token = "";

  if (trimmed.includes("token=")) {
    const match = trimmed.match(/[?&]token=([a-f0-9]+)/i);
    if (match) token = match[1];
  } else if (trimmed.includes("/r/")) {
    const match = trimmed.match(/\/r\/([a-f0-9]+)/i);
    if (match) token = match[1];
  } else if (trimmed.toUpperCase().startsWith("PICKUP:")) {
    token = trimmed.substring(7);
  } else {
    const match = trimmed.match(/[a-f0-9]{12,64}/i);
    if (match) token = match[0];
  }

  token = token.toLowerCase();
  
  if (token.length >= 12 && token.length <= 64 && /^[a-f0-9]+$/.test(token)) {
    return { valid: true, token };
  }

  return { valid: false, token: "", error: "QR_INVALID" };
}

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
    case "WRONG_BAR": return "BARRA INCORRECTA";
    case "INSUFFICIENT_BAR_STOCK": return "SIN STOCK EN ESTA BARRA";
    default: return "ERROR";
  }
}

function getSourceLabel(source: string): string {
  return source === "ticket" ? "Cover" : "Caja";
}

function getDeliveryDisplay(deliver?: DeliverInfo): { name: string; quantity: number } {
  if (!deliver) return { name: "Pedido", quantity: 1 };
  
  if (deliver.type === "cover" && deliver.name) {
    return { name: deliver.name, quantity: deliver.quantity || 1 };
  }
  
  if (deliver.type === "menu_items" && deliver.items && deliver.items.length > 0) {
    if (deliver.items.length === 1) {
      return { name: deliver.items[0].name, quantity: deliver.items[0].quantity };
    }
    const totalQty = deliver.items.reduce((sum, item) => sum + item.quantity, 0);
    return { name: deliver.items[0].name, quantity: totalQty };
  }
  
  return { name: "Pedido", quantity: 1 };
}

export default function Bar() {
  const { isDemoMode } = useDemoMode();
  const isMobile = useIsMobile();
  const [isVerified, setIsVerified] = useState(true);
  
  // History refresh trigger - increments after each scan attempt
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [userName, setUserName] = useState<string>("");
  
  // Bar selection
  const [barLocations, setBarLocations] = useState<BarLocation[]>([]);
  const [selectedBarId, setSelectedBarId] = useState<string>("");
  const [showBarSelection, setShowBarSelection] = useState(true);
  
  // Scanner modes
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [scannerSessionId, setScannerSessionId] = useState(0);
  const [scannerReady, setScannerReady] = useState(false);
  
  // Manual entry mode
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState("");
  
  // Debug mode
  const [debugMode, setDebugMode] = useState(false);
  const [lastParsedToken, setLastParsedToken] = useState("");
  const debugTapCountRef = useRef(0);
  const debugTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // USB Scanner: hidden input ref and buffer
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef("");
  const lastProcessedTokenRef = useRef<string>("");
  const lastProcessedTimeRef = useRef<number>(0);
  
  // Backend call tracking
  const redeemInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Camera scanner ref
  const cameraRef = useRef<Html5Qrcode | null>(null);
  
  // Timers
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const navigate = useNavigate();

  // Fetch bar locations on mount
  useEffect(() => {
    fetchBarLocations();
    const savedBarId = localStorage.getItem("bartenderBarId");
    if (savedBarId) setSelectedBarId(savedBarId);
  }, []);

  // Fetch user info on mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile) {
          setUserName(profile.full_name || "");
        }
      }
    };
    fetchUserInfo();
  }, []);

  // Save bar selection to localStorage
  useEffect(() => {
    if (selectedBarId) localStorage.setItem("bartenderBarId", selectedBarId);
  }, [selectedBarId]);

  // CRITICAL: Always keep scanner input focused when in idle state
  useEffect(() => {
    if (isVerified && !showBarSelection && scanState === "idle") {
      focusScannerInput();
    }
  }, [isVerified, showBarSelection, scanState]);

  // Refocus on window focus
  useEffect(() => {
    const handleWindowFocus = () => {
      if (scanState === "idle" && !showManualEntry) {
        focusScannerInput();
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [scanState, showManualEntry]);

  const focusScannerInput = useCallback(() => {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      if (scannerInputRef.current && !showManualEntry) {
        scannerInputRef.current.focus();
      }
    }, 50);
  }, [showManualEntry]);

  const fetchBarLocations = async () => {
    const { data, error } = await supabase
      .from("stock_locations")
      .select("*")
      .eq("type", "bar")
      .eq("is_active", true)
      .order("name");
    
    if (!error && data) {
      setBarLocations(data);
      if (data.length === 1) {
        setSelectedBarId(data[0].id);
        setShowBarSelection(false);
      }
      const savedBarId = localStorage.getItem("bartenderBarId");
      if (savedBarId && data.some(b => b.id === savedBarId)) {
        setSelectedBarId(savedBarId);
      }
    }
  };

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

  // Reset to ready state - used by Limpiar and auto-dismiss
  const resetToReady = useCallback(() => {
    clearAllTimers();
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    redeemInFlightRef.current = false;
    setResult(null);
    setScanState("idle");
    scanBufferRef.current = "";
    
    // Refocus scanner input
    focusScannerInput();
  }, [clearAllTimers, focusScannerInput]);

  // Process token via backend
  const processToken = useCallback(async (token: string) => {
    // Check cooldown for duplicate suppression
    const now = Date.now();
    if (token === lastProcessedTokenRef.current && 
        now - lastProcessedTimeRef.current < COOLDOWN_MS) {
      console.log("[Bar] Duplicate token within cooldown, ignoring");
      focusScannerInput();
      return;
    }

    // Guard: already processing
    if (redeemInFlightRef.current) {
      console.log("[Bar] Already processing, ignoring");
      return;
    }

    // Update tracking
    lastProcessedTokenRef.current = token;
    lastProcessedTimeRef.current = now;
    setLastParsedToken(token);
    
    setScanState("processing");
    setResult(null);

    abortControllerRef.current = new AbortController();

    // Processing timeout
    processingTimeoutRef.current = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      redeemInFlightRef.current = false;
      
      setResult({
        success: false,
        error_code: "TIMEOUT",
        message: "Tiempo de espera agotado - reintenta",
      });
      setScanState("error");
      dismissTimerRef.current = setTimeout(resetToReady, ERROR_DISMISS_MS);
    }, PROCESSING_TIMEOUT_MS);

    try {
      redeemInFlightRef.current = true;
      
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: selectedBarId || null,
      });

      if (abortControllerRef.current?.signal.aborted) return;

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      
      redeemInFlightRef.current = false;

      if (error) throw error;

      const resultData = data as RedemptionResult;
      setResult(resultData);
      setScanState(resultData.success ? "success" : "error");
      
      // Log audit event
      logAuditEvent({
        action: "redeem_pickup_token",
        status: resultData.success ? "success" : "fail",
        metadata: {
          token: token.substring(0, 8) + "...",
          error_code: resultData.error_code,
          bar_id: selectedBarId,
        },
      });
      
      // Trigger history refresh after any scan
      setHistoryRefreshTrigger(prev => prev + 1);

      // Auto-dismiss
      let timeout = SUCCESS_DISMISS_MS;
      if (!resultData.success) {
        if (resultData.error_code === 'ALREADY_REDEEMED') {
          timeout = USED_DISMISS_MS;
        } else if (resultData.error_code === 'INSUFFICIENT_BAR_STOCK') {
          timeout = INSUFFICIENT_STOCK_DISMISS_MS;
        } else {
          timeout = ERROR_DISMISS_MS;
        }
      }
      dismissTimerRef.current = setTimeout(resetToReady, timeout);
    } catch (error: any) {
      if (abortControllerRef.current?.signal.aborted) return;
      
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      
      redeemInFlightRef.current = false;
      
      console.error("Redemption error:", error);
      setResult({
        success: false,
        error_code: "SYSTEM_ERROR",
        message: error.message || "Error al procesar el código",
      });
      setScanState("error");
      
      // Trigger history refresh even on errors
      setHistoryRefreshTrigger(prev => prev + 1);
      
      dismissTimerRef.current = setTimeout(resetToReady, ERROR_DISMISS_MS);
    }
  }, [resetToReady, selectedBarId, focusScannerInput]);

  // Handle USB scanner input (hidden input keydown)
  const handleScannerKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const rawValue = scanBufferRef.current.trim();
      
      // Clear buffer immediately
      scanBufferRef.current = "";
      if (scannerInputRef.current) {
        scannerInputRef.current.value = "";
      }
      
      if (!rawValue) return;
      
      const parsed = parseQRToken(rawValue);
      
      if (!parsed.valid) {
        setResult({
          success: false,
          error_code: "QR_INVALID",
          message: "Código QR no válido",
        });
        setScanState("error");
        dismissTimerRef.current = setTimeout(resetToReady, ERROR_DISMISS_MS);
        return;
      }
      
      processToken(parsed.token);
    }
  }, [processToken, resetToReady]);

  // Handle character input from USB scanner
  const handleScannerInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    scanBufferRef.current = e.target.value;
  }, []);

  // Handle camera QR scan
  const handleCameraScan = useCallback((decodedText: string) => {
    const parsed = parseQRToken(decodedText);
    
    if (!parsed.valid) {
      setResult({
        success: false,
        error_code: "QR_INVALID",
        message: "Código QR no válido",
      });
      setScanState("error");
      dismissTimerRef.current = setTimeout(resetToReady, ERROR_DISMISS_MS);
      return;
    }
    
    processToken(parsed.token);
  }, [processToken, resetToReady]);

  // Start camera scanner
  const startCamera = useCallback(async () => {
    const elementId = `qr-reader-${scannerSessionId}`;
    const element = document.getElementById(elementId);
    
    if (!element || cameraRef.current) return;

    try {
      const scanner = new Html5Qrcode(elementId, { verbose: false });
      cameraRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 250, height: 250 }, aspectRatio: 1, disableFlip: false },
        handleCameraScan,
        () => {}
      );
      
      setScannerReady(true);
      setCameraAvailable(true);
    } catch (error) {
      console.error("Camera error:", error);
      setCameraAvailable(false);
      setCameraEnabled(false);
    }
  }, [scannerSessionId, handleCameraScan]);

  // Stop camera scanner
  const stopCamera = useCallback(async () => {
    if (cameraRef.current) {
      try {
        await cameraRef.current.stop();
      } catch (e) {}
      cameraRef.current = null;
      setScannerReady(false);
    }
  }, []);

  // Effect: Start camera when enabled
  useEffect(() => {
    if (isVerified && !showBarSelection && cameraEnabled && scanState === "idle") {
      const timer = setTimeout(startCamera, 100);
      return () => clearTimeout(timer);
    }
  }, [isVerified, showBarSelection, cameraEnabled, scanState, scannerSessionId, startCamera]);

  // Effect: Stop camera when disabled
  useEffect(() => {
    if (!cameraEnabled) stopCamera();
  }, [cameraEnabled, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
      stopCamera();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [clearAllTimers, stopCamera]);

  // Manual entry submit
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
        message: "Código inválido",
      });
      setScanState("error");
      setManualToken("");
      dismissTimerRef.current = setTimeout(() => {
        resetToReady();
        setShowManualEntry(false);
      }, ERROR_DISMISS_MS);
      return;
    }

    setManualToken("");
    processToken(parsed.token);
  };

  // Retry last token
  const handleRetry = () => {
    if (!lastProcessedTokenRef.current) {
      toast.error("No hay token previo para reintentar");
      return;
    }
    // Reset cooldown to allow retry
    lastProcessedTimeRef.current = 0;
    processToken(lastProcessedTokenRef.current);
  };

  // Toggle camera
  const toggleCamera = () => {
    if (cameraEnabled) {
      stopCamera();
      setCameraEnabled(false);
    } else {
      setScannerSessionId(prev => prev + 1);
      setCameraEnabled(true);
    }
  };

  const handleLogout = async () => {
    await stopCamera();
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

  // Debug mode toggle
  const handleHeaderTap = () => {
    debugTapCountRef.current++;
    if (debugTapTimerRef.current) clearTimeout(debugTapTimerRef.current);
    
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

  const confirmBarSelection = () => {
    if (!selectedBarId) {
      toast.error("Selecciona una barra");
      return;
    }
    setShowBarSelection(false);
  };

  const changeBarSelection = () => {
    setShowBarSelection(true);
    stopCamera();
  };

  const selectedBarName = barLocations.find(b => b.id === selectedBarId)?.name;

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <WorkerPinDialog open={showPinDialog} onVerified={handlePinVerified} onCancel={handlePinCancel} />
      </div>
    );
  }

  // Bar Selection Screen
  if (showBarSelection) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto space-y-6 pt-12">
          <div className="text-center space-y-2">
            <MapPin className="w-16 h-16 mx-auto text-primary" />
            <h1 className="text-3xl font-bold">Selecciona tu Barra</h1>
            <p className="text-muted-foreground">¿En qué barra estás atendiendo?</p>
          </div>

          <Card className="p-6 space-y-6">
            {barLocations.length === 0 ? (
              <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                No hay barras disponibles. Contacta al administrador.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {barLocations.map((bar) => (
                  <Card
                    key={bar.id}
                    onClick={() => setSelectedBarId(bar.id)}
                    className={`p-6 cursor-pointer transition-all hover:scale-105 ${
                      selectedBarId === bar.id ? "border-primary bg-primary/10 ring-2 ring-primary" : "hover:border-primary/50"
                    }`}
                  >
                    <div className="text-center">
                      <MapPin className={`w-10 h-10 mx-auto mb-3 ${selectedBarId === bar.id ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="font-bold text-lg">{bar.name}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Button onClick={confirmBarSelection} disabled={!selectedBarId} className="w-full h-14 text-lg">
              Comenzar a Escanear
            </Button>
          </Card>

          <div className="text-center">
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Full-screen SUCCESS overlay
  if (scanState === "success" && result?.success) {
    const delivery = getDeliveryDisplay(result.deliver);
    const hasMultipleItems = result.deliver?.type === "menu_items" && result.deliver?.items && result.deliver.items.length > 1;
    
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-green-600 text-white p-6" onClick={resetToReady}>
        <CheckCircle2 className="w-24 h-24 mb-4" />
        <h1 className="text-4xl font-black mb-4 tracking-tight">ENTREGAR</h1>
        <p className="text-5xl font-black mb-3 text-center leading-tight">{delivery.name}</p>
        <div className="bg-white/20 rounded-full px-6 py-2 mb-4">
          <span className="text-3xl font-bold">x{delivery.quantity}</span>
        </div>
        
        {hasMultipleItems && result.deliver?.items && (
          <div className="bg-white/10 rounded-xl p-4 mb-4 w-full max-w-sm">
            {result.deliver.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-lg">
                <span>{item.name}</span>
                <span className="font-bold">x{item.quantity}</span>
              </div>
            ))}
          </div>
        )}
        
        <p className="text-lg opacity-90 mb-2">Origen: {getSourceLabel(result.deliver?.source || "sale")}</p>
        {(result.deliver?.sale_number || result.deliver?.ticket_number || result.sale_number) && (
          <p className="text-sm opacity-70">#{result.deliver?.sale_number || result.deliver?.ticket_number || result.sale_number}</p>
        )}
        
        <Button onClick={(e) => { e.stopPropagation(); resetToReady(); }} variant="secondary" className="mt-6 h-14 px-8 text-lg font-bold bg-white hover:bg-white/90 text-green-700 border-0 shadow-lg">
          <RefreshCw className="w-5 h-5 mr-2" />
          Siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Auto-cierre en {SUCCESS_DISMISS_MS/1000}s</p>
      </div>
    );
  }

  // Full-screen ALREADY USED overlay
  if (scanState === "error" && result?.error_code === "ALREADY_REDEEMED") {
    const delivery = getDeliveryDisplay(result.deliver);
    const previousTime = result.previously_redeemed_at ? format(new Date(result.previously_redeemed_at), "HH:mm", { locale: es }) : null;
    
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-orange-500 text-white p-6" onClick={resetToReady}>
        <AlertCircle className="w-24 h-24 mb-4" />
        <h1 className="text-4xl font-black mb-4 tracking-tight">YA USADO</h1>
        {result.deliver && (
          <>
            <p className="text-3xl font-bold mb-2">{delivery.name}</p>
            <div className="bg-white/20 rounded-full px-4 py-1 mb-4">
              <span className="text-xl font-bold">x{delivery.quantity}</span>
            </div>
          </>
        )}
        {previousTime && (
          <div className="flex items-center gap-2 text-lg opacity-90 mb-2">
            <Clock className="w-5 h-5" />
            <span>Canjeado a las {previousTime}</span>
          </div>
        )}
        <Button onClick={(e) => { e.stopPropagation(); resetToReady(); }} variant="secondary" className="mt-6 h-14 px-8 text-lg font-bold bg-white hover:bg-white/90 text-orange-600 border-0 shadow-lg">
          <RefreshCw className="w-5 h-5 mr-2" />
          Siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Auto-cierre en {USED_DISMISS_MS/1000}s</p>
      </div>
    );
  }

  // Full-screen INSUFFICIENT STOCK overlay
  if (scanState === "error" && result?.error_code === "INSUFFICIENT_BAR_STOCK") {
    const delivery = getDeliveryDisplay(result.deliver);
    const missingItems = result.missing?.slice(0, 3) || [];
    
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-amber-600 text-white" onClick={(e) => e.stopPropagation()}>
        <Package className="w-24 h-24 mb-4" />
        <h1 className="text-4xl font-black mb-2 tracking-tight text-center">SIN STOCK</h1>
        <p className="text-xl opacity-90 text-center mb-4">{result.bar_name}</p>
        
        <div className="bg-white/20 rounded-xl p-4 w-full max-w-sm mb-4">
          <p className="text-sm opacity-80 text-center mb-1">Pedido:</p>
          <p className="text-2xl font-bold text-center">{delivery.name}</p>
          <p className="text-center opacity-90">x{delivery.quantity}</p>
        </div>
        
        {missingItems.length > 0 && (
          <div className="bg-white/20 rounded-xl p-4 w-full max-w-sm space-y-2">
            <p className="text-sm font-semibold text-center opacity-80">Falta:</p>
            {missingItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-base">
                <span>{item.product_name}</span>
                <span className="font-mono">{item.required_qty} {item.unit}</span>
              </div>
            ))}
          </div>
        )}
        
        <p className="text-lg mt-4 opacity-80 text-center">El QR sigue válido - prueba en otra barra</p>
        
        <div className="flex flex-col gap-3 mt-6 w-full max-w-sm">
          <Button onClick={() => changeBarSelection()} variant="secondary" className="w-full h-14 text-lg font-bold bg-white hover:bg-white/90 text-amber-700 border-0 shadow-lg">
            <MapPin className="w-5 h-5 mr-2" />
            Cambiar Barra
          </Button>
          <Button onClick={resetToReady} variant="outline" className="w-full h-12 text-base font-semibold bg-transparent border-white/50 text-white hover:bg-white/10">
            <RefreshCw className="w-5 h-5 mr-2" />
            Siguiente
          </Button>
        </div>
      </div>
    );
  }

  // Full-screen error overlay (other errors)
  if (scanState === "error" && result) {
    const bgColor = result.error_code === "WRONG_BAR" ? "bg-orange-600" : result.error_code === "QR_INVALID" ? "bg-gray-600" : "bg-red-600";
    const btnTextColor = result.error_code === "WRONG_BAR" ? "text-orange-700" : result.error_code === "QR_INVALID" ? "text-gray-700" : "text-red-700";
    
    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 ${bgColor} text-white`} onClick={resetToReady}>
        <XCircle className="w-32 h-32 mb-6" />
        <h1 className="text-4xl font-black mb-4 tracking-tight text-center">{getErrorTitle(result.error_code)}</h1>
        <p className="text-xl opacity-90 text-center max-w-sm">{result.message}</p>
        
        <Button onClick={(e) => { e.stopPropagation(); resetToReady(); }} variant="secondary" className={`mt-8 h-14 px-8 text-lg font-bold border-0 shadow-lg bg-white hover:bg-white/90 ${btnTextColor}`}>
          <RefreshCw className="w-5 h-5 mr-2" />
          Siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Auto-cierre en {ERROR_DISMISS_MS/1000}s</p>
      </div>
    );
  }

  // Full-screen processing overlay
  if (scanState === "processing") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-24 h-24 animate-spin text-primary mb-6" />
        <h2 className="text-2xl font-bold text-foreground">Validando...</h2>
        {debugMode && lastParsedToken && (
          <p className="mt-4 text-xs text-muted-foreground font-mono">Token: {lastParsedToken.slice(0, 8)}...</p>
        )}
        <Button variant="outline" onClick={resetToReady} className="mt-8 h-12 px-6 text-base font-semibold">
          <Trash2 className="w-4 h-4 mr-2" />
          Cancelar
        </Button>
      </div>
    );
  }

  // Main scanning interface
  return (
    <>
      {isDemoMode && <DemoWatermark />}
      
      {/* HIDDEN USB SCANNER INPUT - Always present, always focused */}
      <input
        ref={scannerInputRef}
        type="text"
        className="absolute opacity-0 pointer-events-none"
        style={{ position: 'fixed', top: -9999, left: -9999 }}
        onKeyDown={handleScannerKeyDown}
        onChange={handleScannerInput}
        autoFocus
        tabIndex={-1}
      />
      
      <div className={`min-h-screen bg-background flex flex-col ${isDemoMode ? 'pt-10' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex flex-col" onClick={handleHeaderTap}>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-primary select-none">Barra</h1>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm font-medium text-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {selectedBarName}
              </span>
            </div>
            {userName && <p className="text-xs text-muted-foreground">{userName}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={changeBarSelection}>Cambiar</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Control Bar */}
        <div className="flex items-center justify-between p-3 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            {/* Scanner ready indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium">
              <ScanLine className="w-4 h-4" />
              <span>Scanner listo</span>
            </div>
            
            {/* Camera toggle */}
            <Button variant={cameraEnabled ? "default" : "outline"} size="sm" onClick={toggleCamera} className="gap-2">
              <Camera className="w-4 h-4" />
              {cameraEnabled ? "Cámara ON" : "Cámara"}
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Limpiar */}
            <Button variant="outline" size="sm" onClick={resetToReady} className="gap-1">
              <Trash2 className="w-4 h-4" />
              Limpiar
            </Button>
            
            {/* Reintentar */}
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={!lastProcessedTokenRef.current} className="gap-1">
              <RotateCcw className="w-4 h-4" />
              Reintentar
            </Button>
            
            {/* Manual entry toggle */}
            <Button variant={showManualEntry ? "default" : "outline"} size="sm" onClick={() => setShowManualEntry(!showManualEntry)} className="gap-1">
              <Keyboard className="w-4 h-4" />
              Manual
            </Button>
          </div>
        </div>

        {/* Main Content - 2 column on desktop */}
        <div className="flex-1 flex flex-col md:flex-row">
          {/* Left: Scanner Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Manual Entry Panel */}
            {showManualEntry && (
              <div className="p-4 bg-card border-b border-border">
                <form onSubmit={handleManualSubmit} className="flex gap-2 max-w-xl mx-auto">
                  <Input
                    type="text"
                    placeholder="Ingresa el código del ticket..."
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="h-12 text-lg font-mono flex-1"
                    autoFocus
                  />
                  <Button type="submit" className="h-12 px-6">Canjear</Button>
                </form>
              </div>
            )}

            {/* Camera viewport (optional) */}
            {cameraEnabled && (
              <div className="flex-1 relative bg-black min-h-[300px]">
                <div key={scannerSessionId} id={`qr-reader-${scannerSessionId}`} className="w-full h-full" />
                
                {!scannerReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <Loader2 className="w-12 h-12 animate-spin text-white" />
                  </div>
                )}
                
                {scannerReady && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-4 border-white/50 rounded-2xl" />
                  </div>
                )}
              </div>
            )}

            {/* No camera view - USB scanner ready */}
            {!cameraEnabled && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-32 h-32 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6">
                  <ScanLine className="w-16 h-16 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Listo para escanear</h2>
                <p className="text-muted-foreground max-w-md">
                  Escanea un código QR con el lector USB. El sistema procesará automáticamente el código.
                </p>
                
                {debugMode && (
                  <div className="mt-6 p-4 bg-muted rounded-lg text-left text-xs font-mono max-w-sm w-full">
                    <p>Estado: {scanState}</p>
                    <p>Buffer: {scanBufferRef.current || "(vacío)"}</p>
                    <p>Último: {lastParsedToken || "(ninguno)"}</p>
                    <p>Cámara: {cameraAvailable ? "disponible" : "no disponible"}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: History Panel (desktop only) */}
          {!isMobile && selectedBarId && (
            <div className="hidden md:flex w-80 lg:w-96 border-l border-border bg-card flex-col">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Historial de canjes</h2>
              </div>
              <div className="flex-1 p-3 overflow-hidden">
                <RedemptionHistory 
                  barLocationId={selectedBarId} 
                  refreshTrigger={historyRefreshTrigger} 
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
