import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogOut, CheckCircle2, XCircle, AlertCircle, Keyboard, Camera, RefreshCw, MapPin, Package, Clock, Trash2, RotateCcw, ScanLine, History, Usb } from "lucide-react";
import { useNavigate } from "react-router-dom";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { Html5Qrcode } from "html5-qrcode";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { logAuditEvent } from "@/lib/monitoring";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VenueGuard } from "@/components/VenueGuard";
import { VenueIndicator } from "@/components/VenueIndicator";
import { MixerSelectionDialog, type MixerSlot } from "@/components/bar/MixerSelectionDialog";
import { WasteRegistrationDialog } from "@/components/dashboard/WasteRegistrationDialog";
import { OpenBottleDialog } from "@/components/bar/OpenBottleDialog";
import { useOpenBottles, type BottleCheckResult } from "@/hooks/useOpenBottles";
import { DEFAULT_VENUE_ID } from "@/lib/venue";

type MissingItem = {
  product_name: string;
  required_qty: number;
  unit: string;
};

type DeliverItem = {
  name: string;
  quantity: number;
  addons?: string[];
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

// Local scan history entry (in-memory, instant updates)
type ScanHistoryEntry = {
  id: string;
  time: Date;
  status: "SUCCESS" | "ALREADY_REDEEMED" | "EXPIRED" | "INVALID" | "CANCELLED" | "INSUFFICIENT_STOCK" | "ERROR";
  label: string;
  tokenShort: string;
};

// Reader modes
type ReaderMode = "USB_SCANNER" | "CAMERA";

type ScanState = "idle" | "processing" | "success" | "error" | "waiting_resume" | "mixer_selection" | "bottle_check";

// Max history entries to keep
const MAX_HISTORY_ENTRIES = 20;

// Timing constants - HARD STOP strategy for CAMERA mode
const DEDUPE_WINDOW_MS = 5000; // 5s dedupe window - ignore same QR within this window
const RESULT_DISPLAY_MS = 2000; // 2s display for any result before showing resume button (CAMERA) or auto-reset (USB)
const PROCESSING_TIMEOUT_MS = 8000;
const USB_AUTO_RESET_MS = 2500; // USB mode auto-resets to idle after result display (slightly longer for reading)

// LocalStorage key for reader mode preference
const READER_MODE_KEY = "bartender_reader_mode";

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

// Helper to map error codes to history status
function mapErrorCodeToStatus(errorCode?: string): ScanHistoryEntry["status"] {
  switch (errorCode) {
    case "ALREADY_REDEEMED": return "ALREADY_REDEEMED";
    case "TOKEN_EXPIRED": return "EXPIRED";
    case "QR_INVALID":
    case "TOKEN_NOT_FOUND": return "INVALID";
    case "SALE_CANCELLED": return "CANCELLED";
    case "INSUFFICIENT_BAR_STOCK":
    case "INSUFFICIENT_STOCK": return "INSUFFICIENT_STOCK";
    default: return "ERROR";
  }
}

// Helper to generate history label
function generateHistoryLabel(result: RedemptionResult): string {
  if (result.success) {
    const delivery = getDeliveryDisplay(result.deliver);
    return `ENTREGAR: ${delivery.name} x${delivery.quantity}`;
  }
  
  switch (result.error_code) {
    case "ALREADY_REDEEMED": return "YA CANJEADO";
    case "TOKEN_EXPIRED": return "VENCIDO";
    case "QR_INVALID": return "QR INVÁLIDO";
    case "TOKEN_NOT_FOUND": return "NO ENCONTRADO";
    case "SALE_CANCELLED": return "CANCELADO";
    case "INSUFFICIENT_BAR_STOCK":
    case "INSUFFICIENT_STOCK": return "SIN STOCK";
    case "TIMEOUT": return "TIMEOUT";
    default: return result.message || "ERROR";
  }
}

export default function Bar() {
  const isMobile = useIsMobile();
  const [isVerified, setIsVerified] = useState(true);
  
  // Local in-memory scan history (instant updates)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [userName, setUserName] = useState<string>("");
  
  // Mixer selection state
  const [mixerSlots, setMixerSlots] = useState<MixerSlot[]>([]);
  const [pendingToken, setPendingToken] = useState<string>("");
  const [pendingMixerOverrides, setPendingMixerOverrides] = useState<{ slot_index: number; product_id: string }[] | null>(null);
  const [isRedeemingWithMixer, setIsRedeemingWithMixer] = useState(false);
  
  // Bar selection
  const [barLocations, setBarLocations] = useState<BarLocation[]>([]);
  const [selectedBarId, setSelectedBarId] = useState<string>("");
  const [showBarSelection, setShowBarSelection] = useState(true);

  // Open bottles state
  const [bottleChecks, setBottleChecks] = useState<BottleCheckResult[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const openBottlesHook = useOpenBottles(DEFAULT_VENUE_ID, selectedBarId || null);

  // Waste request dialog
  const [showWasteDialog, setShowWasteDialog] = useState(false);
  
  // Reader mode - persisted per device
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    const saved = localStorage.getItem(READER_MODE_KEY);
    return (saved === "CAMERA" || saved === "USB_SCANNER") ? saved : "USB_SCANNER";
  });
  
  // Scanner modes - HARD STOP for CAMERA mode
  const [scannerFrozen, setScannerFrozen] = useState(false); // Hard freeze after any decode (CAMERA mode)
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
  
  // HARD DEDUPE: Track last decoded value and time to prevent loops
  const lastDecodedValueRef = useRef<string>("");
  const lastDecodedTimeRef = useRef<number>(0);
  
  // Processing lock - prevents concurrent scan processing (STRICT)
  const isProcessingRef = useRef(false);
  
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
        setCurrentUserId(user.id);
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

  // CRITICAL: Always keep scanner input focused when in USB_SCANNER mode and idle
  useEffect(() => {
    if (isVerified && !showBarSelection && scanState === "idle" && readerMode === "USB_SCANNER") {
      focusScannerInput();
    }
  }, [isVerified, showBarSelection, scanState, readerMode]);

  // Refocus on window focus (USB mode only)
  useEffect(() => {
    const handleWindowFocus = () => {
      if (scanState === "idle" && !showManualEntry && readerMode === "USB_SCANNER") {
        focusScannerInput();
      }
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [scanState, showManualEntry, readerMode]);

  const focusScannerInput = useCallback(() => {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      if (scannerInputRef.current && !showManualEntry && readerMode === "USB_SCANNER") {
        scannerInputRef.current.focus();
      }
    }, 50);
  }, [showManualEntry, readerMode]);

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

  // Handle post-scan transition based on reader mode
  // CAMERA mode: Hard stop, require manual "Escanear siguiente" button
  // USB_SCANNER mode: Auto-reset to idle after brief result display
  const transitionToWaitingResume = useCallback((currentMode: ReaderMode) => {
    clearAllTimers();
    
    // For CAMERA mode: freeze scanner, require manual resume
    if (currentMode === "CAMERA") {
      setScannerFrozen(true);
      
      // Stop camera completely when frozen
      if (cameraRef.current) {
        cameraRef.current.stop().catch(() => {});
        cameraRef.current = null;
        setScannerReady(false);
      }
      
      // After display time, move to waiting_resume state
      dismissTimerRef.current = setTimeout(() => {
        setScanState("waiting_resume");
      }, RESULT_DISPLAY_MS);
    } else {
      // USB_SCANNER mode: Auto-reset to idle for continuous scanning
      dismissTimerRef.current = setTimeout(() => {
        // Clear all locks
        redeemInFlightRef.current = false;
        isProcessingRef.current = false;
        setScannerFrozen(false);
        
        // Clear result and go back to idle
        setResult(null);
        setScanState("idle");
        scanBufferRef.current = "";
        
        // Clear input and refocus
        if (scannerInputRef.current) {
          scannerInputRef.current.value = "";
        }
        focusScannerInput();
      }, USB_AUTO_RESET_MS);
    }
  }, [clearAllTimers, focusScannerInput]);

  // Resume scanning - called by user action ONLY
  const resumeScanning = useCallback(() => {
    clearAllTimers();
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear all locks
    redeemInFlightRef.current = false;
    isProcessingRef.current = false;
    setScannerFrozen(false);
    
    // Clear dedupe to allow same QR on manual resume
    lastDecodedValueRef.current = "";
    lastDecodedTimeRef.current = 0;
    
    setResult(null);
    setScanState("idle");
    scanBufferRef.current = "";
    
    // Restart camera if in CAMERA mode
    if (readerMode === "CAMERA") {
      setScannerSessionId(prev => prev + 1);
    }
    
    // Refocus scanner input if in USB mode
    if (readerMode === "USB_SCANNER") {
      focusScannerInput();
    }
  }, [clearAllTimers, focusScannerInput, readerMode]);

  // Legacy reset alias for manual "Limpiar" button
  const resetToReady = resumeScanning;

  // Redeem token (called after mixer selection or directly if no mixer needed)
  const redeemToken = useCallback(async (token: string, mixerOverrides: { slot_index: number; product_id: string }[] | null): Promise<RedemptionResult | undefined> => {
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
      transitionToWaitingResume(readerMode);
    }, PROCESSING_TIMEOUT_MS);

    try {
      redeemInFlightRef.current = true;
      
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: selectedBarId || null,
        p_mixer_overrides: mixerOverrides ? JSON.stringify(mixerOverrides) : null,
      });

      if (abortControllerRef.current?.signal.aborted) {
        isProcessingRef.current = false;
        return undefined;
      }

      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      
      redeemInFlightRef.current = false;

      if (error) throw error;

      const resultData = data as RedemptionResult;
      
      // Handle TOO_FAST error from backend rate limiting
      if (resultData.error_code === 'TOO_FAST') {
        console.log("[Bar] Backend rate limit hit, ignoring");
        isProcessingRef.current = false;
        setScannerFrozen(false);
        setScanState("idle");
        return undefined;
      }
      
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
          mixer_overrides: mixerOverrides ? mixerOverrides.length : 0,
        },
      });
      
      // Add to local scan history immediately
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(),
        time: new Date(),
        status: resultData.success ? "SUCCESS" : mapErrorCodeToStatus(resultData.error_code),
        label: generateHistoryLabel(resultData),
        tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));

      // HARD STOP: Transition to waiting_resume after showing result
      transitionToWaitingResume(readerMode);

      return resultData;
    } catch (error: any) {
      if (abortControllerRef.current?.signal.aborted) {
        isProcessingRef.current = false;
        return undefined;
      }
      
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
      
      redeemInFlightRef.current = false;
      
      console.error("Redemption error:", error);
      const errorResult: RedemptionResult = {
        success: false,
        error_code: "SYSTEM_ERROR",
        message: error.message || "Error al procesar el código",
      };
      setResult(errorResult);
      setScanState("error");
      
      // Add error to local scan history
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(),
        time: new Date(),
        status: "ERROR",
        label: "ERROR DE SISTEMA",
        tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      
      // HARD STOP: Transition to waiting_resume
      transitionToWaitingResume(readerMode);

      return errorResult;
    }
  }, [transitionToWaitingResume, selectedBarId, readerMode]);

  // Process token via backend - checks for mixer requirements first
  const processToken = useCallback(async (token: string) => {
    const now = Date.now();
    
    // Guard 1: Processing lock (prevents concurrent requests)
    if (isProcessingRef.current) {
      console.log("[Bar] Processing lock active, ignoring scan");
      return;
    }
    
    // Guard 2: HARD DEDUPE - same QR within 5 second window = ignore completely
    if (token === lastDecodedValueRef.current && 
        now - lastDecodedTimeRef.current < DEDUPE_WINDOW_MS) {
      console.log("[Bar] Duplicate token within 5s dedupe window, ignoring completely");
      return;
    }

    // Guard 3: Backend call already in flight
    if (redeemInFlightRef.current) {
      console.log("[Bar] Backend call in flight, ignoring");
      return;
    }
    
    // Guard 4: Scanner frozen (waiting for manual resume)
    if (scannerFrozen) {
      console.log("[Bar] Scanner frozen, ignoring decode");
      return;
    }

    // Set processing lock IMMEDIATELY
    isProcessingRef.current = true;
    
    // Update dedupe tracking
    lastDecodedValueRef.current = token;
    lastDecodedTimeRef.current = now;
    setLastParsedToken(token);
    
    setScanState("processing");
    setResult(null);
    
    // HARD STOP: Freeze scanner immediately
    setScannerFrozen(true);
    if (cameraRef.current) {
      cameraRef.current.stop().catch(() => {});
      cameraRef.current = null;
      setScannerReady(false);
    }

    try {
      // Step 1: Check if this token requires mixer selection
      const { data: mixerCheck, error: mixerError } = await supabase.rpc("check_token_mixer_requirements", {
        p_token: token,
      });

      if (mixerError) throw mixerError;

      const mixerResult = mixerCheck as unknown as { success: boolean; requires_mixer_selection: boolean; mixer_slots?: MixerSlot[]; error?: string };
      
      if (!mixerResult.success) {
        // Token not found or already processed
        setResult({
          success: false,
          error_code: mixerResult.error || "TOKEN_NOT_FOUND",
          message: "Token no encontrado o ya procesado",
        });
        setScanState("error");
        transitionToWaitingResume(readerMode);
        return;
      }

      // Step 2: If mixer selection required, show dialog
      if (mixerResult.requires_mixer_selection && mixerResult.mixer_slots && mixerResult.mixer_slots.length > 0) {
        console.log("[Bar] Mixer selection required:", mixerResult.mixer_slots);
        setMixerSlots(mixerResult.mixer_slots);
        setPendingToken(token);
        setScanState("mixer_selection");
        return;
      }

      // Step 3: Check ml ingredients requiring open bottles (if bar selected)
      if (selectedBarId) {
        await checkAndProceedWithBottles(token, null);
        return;
      }
      // Step 4: Redeem directly
      await redeemToken(token, null);
    } catch (error: any) {
      console.error("Check mixer error:", error);
      const errorResult: RedemptionResult = {
        success: false,
        error_code: "SYSTEM_ERROR",
        message: error.message || "Error al procesar el código",
      };
      setResult(errorResult);
      setScanState("error");
      transitionToWaitingResume(readerMode);
    }
  }, [transitionToWaitingResume, selectedBarId, scannerFrozen, readerMode, redeemToken]);

  const redeemWithBottleDeduction = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null,
    checks: BottleCheckResult[]
  ) => {
    const redeemResult = await redeemToken(token, mixerOverrides);

    // Solo descontar ml si el canje fue exitoso
    if (redeemResult?.success !== true) return;

    for (const check of checks) {
      if (check.required_ml <= 0) continue;
      try {
        await openBottlesHook.deductMl({ productId: check.product_id, mlToDeduct: check.required_ml, actorUserId: currentUserId, reason: `Canje QR ${token.slice(-6)}` });
      } catch (e) { console.error("[Bar] Bottle deduction non-blocking:", e); }
    }
  }, [redeemToken, openBottlesHook, currentUserId]);

  const checkAndProceedWithBottles = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null
  ) => {
    try {
      const { data: tokenData } = await supabase
        .from("pickup_tokens")
        .select("id, sale_id, sales!pickup_tokens_sale_id_fkey(sale_items!sale_items_sale_id_fkey(quantity, cocktails:cocktail_id(cocktail_ingredients(quantity, products:product_id(id, name, capacity_ml)))))")
        .eq("token", token)
        .maybeSingle();

      if (!tokenData) { await redeemToken(token, mixerOverrides); return; }

      const mlIngredients = new Map<string, { product_id: string; product_name: string; required_ml: number }>();
      for (const si of ((tokenData as any)?.sales?.sale_items || [])) {
        const qty = si.quantity || 1;
        for (const ing of (si.cocktails?.cocktail_ingredients || [])) {
          const p = ing.products;
          if (!p?.capacity_ml || p.capacity_ml <= 0) continue;
          const ingQty = (ing.quantity || 0) * qty;
          if (ingQty <= 0) continue;
          const ex = mlIngredients.get(p.id);
          if (ex) { ex.required_ml += ingQty; }
          else { mlIngredients.set(p.id, { product_id: p.id, product_name: p.name, required_ml: ingQty }); }
        }
      }

      if (mlIngredients.size === 0) { await redeemToken(token, mixerOverrides); return; }

      const checks = openBottlesHook.checkBottlesForIngredients(Array.from(mlIngredients.values()));
      setPendingToken(token);
      setPendingMixerOverrides(mixerOverrides);
      setBottleChecks(checks);

      if (checks.every(c => c.sufficient)) {
        await redeemWithBottleDeduction(token, mixerOverrides, checks);
      } else {
        setScanState("bottle_check");
      }
    } catch (err: any) {
      console.error("[Bar] Bottle check error:", err);
      // Si el error viene de la query ambigua u otro, mostrar error en vez de fallar silenciosamente
      const errMsg = err?.message || "Error al verificar stock de botellas";
      setResult({
        success: false,
        error_code: "SYSTEM_ERROR",
        message: errMsg,
      });
      setScanState("error");
      transitionToWaitingResume(readerMode);
    }
  }, [openBottlesHook, redeemToken, redeemWithBottleDeduction, transitionToWaitingResume, readerMode]);

  const handleBottleCheckContinue = useCallback(async () => {
    // Guard: nunca canjear si aún faltan ml en alguna botella
    if (bottleChecks.some(c => !c.sufficient)) {
      console.warn("[Bar] handleBottleCheckContinue bloqueado: faltan ml en botellas");
      return;
    }
    const token = pendingToken; const overrides = pendingMixerOverrides; const checks = bottleChecks;
    setBottleChecks([]); setPendingToken(""); setPendingMixerOverrides(null);
    setScanState("processing");
    await redeemWithBottleDeduction(token, overrides, checks);
  }, [pendingToken, pendingMixerOverrides, bottleChecks, redeemWithBottleDeduction]);

  const handleBottleCheckCancel = useCallback(() => {
    setBottleChecks([]); setPendingToken(""); setPendingMixerOverrides(null);
    isProcessingRef.current = false; setScannerFrozen(false); setScanState("idle");
    if (readerMode === "CAMERA") setScannerSessionId(prev => prev + 1);
    else focusScannerInput();
  }, [readerMode, focusScannerInput]);

  const handleOpenBottleFromDialog = useCallback(async (productId: string, labelCode?: string) => {
    if (!currentUserId) throw new Error("Sin usuario activo");
    const { data: pd } = await supabase.from("products").select("capacity_ml, name").eq("id", productId).single();
    const cap = Number(pd?.capacity_ml || 0);
    if (!cap) throw new Error("El producto no tiene capacidad en ml definida");
    await openBottlesHook.openBottle({ productId, initialMl: cap, labelCode, actorUserId: currentUserId });
    await openBottlesHook.fetchBottles();
    const updated = openBottlesHook.checkBottlesForIngredients(bottleChecks.map(c => ({ product_id: c.product_id, product_name: c.product_name, required_ml: c.required_ml })));
    setBottleChecks(updated);
    toast.success(`Botella de ${pd?.name || "producto"} abierta`);
  }, [currentUserId, bottleChecks, openBottlesHook]);


  const handleMixerConfirm = useCallback(async (selections: { slot_index: number; product_id: string }[]) => {
    setIsRedeemingWithMixer(true);
    try {
      await redeemToken(pendingToken, selections);
    } finally {
      setIsRedeemingWithMixer(false);
      setMixerSlots([]);
      setPendingToken("");
    }
  }, [pendingToken, redeemToken]);

  // Handle mixer selection cancellation
  const handleMixerCancel = useCallback(() => {
    setMixerSlots([]);
    setPendingToken("");
    isProcessingRef.current = false;
    setScannerFrozen(false);
    setScanState("idle");
    
    // Add cancellation to history
    const historyEntry: ScanHistoryEntry = {
      id: crypto.randomUUID(),
      time: new Date(),
      status: "CANCELLED",
      label: "SELECCIÓN CANCELADA",
      tokenShort: pendingToken.slice(-6),
    };
    setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
    
    // Resume scanning
    if (readerMode === "CAMERA") {
      setScannerSessionId(prev => prev + 1);
    } else {
      focusScannerInput();
    }
  }, [pendingToken, readerMode, focusScannerInput]);

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
      
      // Guard: don't process if frozen or not idle
      if (scannerFrozen || isProcessingRef.current || scanState !== "idle") {
        console.log("[Bar] Scan rejected - frozen or processing or not idle");
        focusScannerInput();
        return;
      }
      
      const parsed = parseQRToken(rawValue);
      
      if (!parsed.valid) {
        isProcessingRef.current = true;
        setResult({
          success: false,
          error_code: "QR_INVALID",
          message: "Código QR no válido",
        });
        setScanState("error");
        // Add invalid QR to history
        const historyEntry: ScanHistoryEntry = {
          id: crypto.randomUUID(),
          time: new Date(),
          status: "INVALID",
          label: "QR INVÁLIDO",
          tokenShort: rawValue.slice(-6) || "??????",
        };
        setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
        // USB mode: auto-reset after display
        transitionToWaitingResume("USB_SCANNER");
        return;
      }
      
      processToken(parsed.token);
    }
  }, [processToken, scannerFrozen, scanState, focusScannerInput, transitionToWaitingResume]);

  // Handle character input from USB scanner
  const handleScannerInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    scanBufferRef.current = e.target.value;
  }, []);

  // Handle camera QR scan
  const handleCameraScan = useCallback((decodedText: string) => {
    // Guard: don't process if frozen or not idle
    if (scannerFrozen || isProcessingRef.current || scanState !== "idle") {
      return;
    }
    
    const parsed = parseQRToken(decodedText);
    
    if (!parsed.valid) {
      isProcessingRef.current = true;
      setScannerFrozen(true);
      setResult({
        success: false,
        error_code: "QR_INVALID",
        message: "Código QR no válido",
      });
      setScanState("error");
      // Add invalid QR to history
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(),
        time: new Date(),
        status: "INVALID",
        label: "QR INVÁLIDO",
        tokenShort: decodedText.slice(-6) || "??????",
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      // Camera mode: require manual resume
      transitionToWaitingResume("CAMERA");
      return;
    }
    
    processToken(parsed.token);
  }, [processToken, scannerFrozen, scanState, transitionToWaitingResume]);

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
      // Fall back to USB mode if camera fails
      setReaderMode("USB_SCANNER");
      localStorage.setItem(READER_MODE_KEY, "USB_SCANNER");
      toast.error("Cámara no disponible. Cambiado a modo USB.");
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

  // Effect: Start camera when in CAMERA mode AND not frozen
  useEffect(() => {
    if (isVerified && !showBarSelection && readerMode === "CAMERA" && scanState === "idle" && !scannerFrozen) {
      const timer = setTimeout(startCamera, 100);
      return () => clearTimeout(timer);
    }
  }, [isVerified, showBarSelection, readerMode, scanState, scannerSessionId, startCamera, scannerFrozen]);

  // Effect: Stop camera when not in CAMERA mode or frozen
  useEffect(() => {
    if (readerMode !== "CAMERA" || scannerFrozen) stopCamera();
  }, [readerMode, stopCamera, scannerFrozen]);

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
      isProcessingRef.current = true;
      setResult({
        success: false,
        error_code: "QR_INVALID",
        message: "Código inválido",
      });
      setScanState("error");
      // Add invalid to history
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(),
        time: new Date(),
        status: "INVALID",
        label: "CÓDIGO INVÁLIDO",
        tokenShort: input.slice(-6) || "??????",
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      setManualToken("");
      // Manual entry uses current reader mode behavior
      transitionToWaitingResume(readerMode);
      setShowManualEntry(false);
      return;
    }

    setManualToken("");
    processToken(parsed.token);
  };

  // Retry last token
  const handleRetry = () => {
    if (!lastDecodedValueRef.current) {
      toast.error("No hay token previo para reintentar");
      return;
    }
    // Clear dedupe to allow retry
    lastDecodedTimeRef.current = 0;
    processToken(lastDecodedValueRef.current);
  };

  // Change reader mode
  const handleReaderModeChange = (mode: string) => {
    if (mode === "CAMERA" || mode === "USB_SCANNER") {
      // Stop camera before mode change
      stopCamera();
      setScannerFrozen(false);
      setReaderMode(mode);
      localStorage.setItem(READER_MODE_KEY, mode);
      
      // Reset state for new mode
      if (mode === "CAMERA") {
        setScannerSessionId(prev => prev + 1);
      } else {
        focusScannerInput();
      }
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
    const items = result.deliver?.items || [];
    
    // Check if any item has addons
    const hasAnyAddons = items.some(item => item.addons && item.addons.length > 0);
    
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-green-600 text-white p-6" onClick={resetToReady}>
        <CheckCircle2 className="w-24 h-24 mb-4" />
        <h1 className="text-4xl font-black mb-4 tracking-tight">ENTREGAR</h1>
        
        {!hasMultipleItems && !hasAnyAddons ? (
          // Simple display for single item without addons
          <>
            <p className="text-5xl font-black mb-3 text-center leading-tight">{delivery.name}</p>
            <div className="bg-white/20 rounded-full px-6 py-2 mb-4">
              <span className="text-3xl font-bold">x{delivery.quantity}</span>
            </div>
          </>
        ) : (
          // Detailed display for multiple items or items with addons
          <div className="bg-white/10 rounded-xl p-4 mb-4 w-full max-w-sm space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">{item.name}</span>
                  <span className="font-bold">x{item.quantity}</span>
                </div>
                {item.addons && item.addons.length > 0 && (
                  <div className="flex flex-wrap gap-1 ml-2">
                    {item.addons.map((addon, addonIdx) => (
                      <span key={addonIdx} className="text-sm bg-white/20 px-2 py-0.5 rounded-full">
                        + {addon}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <p className="text-lg opacity-90 mb-2">Origen: {getSourceLabel(result.deliver?.source || "sale")}</p>
        {(result.deliver?.sale_number || result.deliver?.ticket_number || result.sale_number) && (
          <p className="text-sm opacity-70">#{result.deliver?.sale_number || result.deliver?.ticket_number || result.sale_number}</p>
        )}
        
        <Button onClick={(e) => { e.stopPropagation(); resetToReady(); }} variant="secondary" className="mt-6 h-16 px-10 text-xl font-bold bg-white hover:bg-white/90 text-green-700 border-0 shadow-lg">
          <RefreshCw className="w-6 h-6 mr-2" />
          LISTO - Siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Toca cualquier parte o escanea el siguiente QR</p>
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
        <Button onClick={(e) => { e.stopPropagation(); resetToReady(); }} variant="secondary" className="mt-6 h-16 px-10 text-xl font-bold bg-white hover:bg-white/90 text-orange-600 border-0 shadow-lg">
          <RefreshCw className="w-6 h-6 mr-2" />
          LISTO - Siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Toca cualquier parte o escanea el siguiente QR</p>
      </div>
    );
  }

  // Full-screen INSUFFICIENT STOCK overlay - stays on reader, no navigation
  if (scanState === "error" && (result?.error_code === "INSUFFICIENT_BAR_STOCK" || result?.error_code === "INSUFFICIENT_STOCK")) {
    const delivery = getDeliveryDisplay(result.deliver);
    const missingItems = result.missing?.slice(0, 5) || [];
    
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-amber-600 text-white" onClick={resetToReady}>
        <Package className="w-24 h-24 mb-4" />
        <h1 className="text-4xl font-black mb-2 tracking-tight text-center">SIN STOCK</h1>
        {result.bar_name && (
          <p className="text-xl opacity-90 text-center mb-4">{result.bar_name}</p>
        )}
        
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
        
        <Button 
          onClick={(e) => { e.stopPropagation(); resetToReady(); }} 
          variant="secondary" 
          className="mt-6 h-16 px-10 text-xl font-bold bg-white hover:bg-white/90 text-amber-700 border-0 shadow-lg"
        >
          <RefreshCw className="w-6 h-6 mr-2" />
          Escanear siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Toca cualquier parte para continuar</p>
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
        
        <Button onClick={(e) => { e.stopPropagation(); resetToReady(); }} variant="secondary" className={`mt-8 h-16 px-10 text-xl font-bold border-0 shadow-lg bg-white hover:bg-white/90 ${btnTextColor}`}>
          <RefreshCw className="w-6 h-6 mr-2" />
          LISTO - Siguiente
        </Button>
        <p className="mt-3 text-sm opacity-60">Toca cualquier parte o escanea el siguiente QR</p>
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
          <p className="mt-4 text-xs font-mono text-muted-foreground">
            Último: {lastParsedToken.slice(0, 8)}...
          </p>
        )}
      </div>
    );
  }

  // Full-screen MIXER SELECTION overlay
  if (scanState === "mixer_selection" && mixerSlots.length > 0) {
    return (
      <MixerSelectionDialog
        mixerSlots={mixerSlots}
        onConfirm={handleMixerConfirm}
        onCancel={handleMixerCancel}
        isLoading={isRedeemingWithMixer}
      />
    );
  }

  // CAMERA mode: Waiting for manual resume after result shown
  if (scanState === "waiting_resume" && readerMode === "CAMERA") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-6">
          <Camera className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Cámara pausada</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-sm">
          Presiona el botón para reactivar el escáner
        </p>
        <Button 
          onClick={resumeScanning} 
          size="lg" 
          className="h-16 px-10 text-xl font-bold gap-3"
        >
          <ScanLine className="w-6 h-6" />
          Escanear siguiente
        </Button>
        
        {debugMode && (
          <div className="mt-6 p-4 bg-muted rounded-lg text-xs font-mono">
            <p>Estado: {scanState}</p>
            <p>Último token: {lastParsedToken || "(ninguno)"}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <VenueGuard>
      <>
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
      
      <div className="min-h-screen bg-background flex flex-col">
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
          <div className="flex items-center gap-3">
            <VenueIndicator variant="header" />
            <Button variant="ghost" size="sm" onClick={changeBarSelection}>Cambiar</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Control Bar */}
        <div className="flex items-center justify-between p-3 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            {/* Reader Mode Selector */}
            <ToggleGroup 
              type="single" 
              value={readerMode} 
              onValueChange={handleReaderModeChange}
              className="bg-background border rounded-lg"
            >
              <ToggleGroupItem 
                value="USB_SCANNER" 
                aria-label="USB Scanner Mode"
                className="gap-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <Usb className="w-4 h-4" />
                <span className="hidden sm:inline">USB</span>
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="CAMERA" 
                aria-label="Camera Mode"
                className="gap-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Cámara</span>
              </ToggleGroupItem>
            </ToggleGroup>
            
            {/* Scanner status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">LISTO</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Limpiar */}
            <Button variant="outline" size="sm" onClick={resetToReady} className="gap-1">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Limpiar</span>
            </Button>
            
            {/* Reintentar */}
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={!lastDecodedValueRef.current} className="gap-1">
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reintentar</span>
            </Button>
            
            {/* Manual entry toggle */}
            <Button variant={showManualEntry ? "default" : "outline"} size="sm" onClick={() => setShowManualEntry(!showManualEntry)} className="gap-1">
              <Keyboard className="w-4 h-4" />
              <span className="hidden sm:inline">Manual</span>
            </Button>

            {/* Waste request button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWasteDialog(true)}
              className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
              title="Solicitar merma"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Merma</span>
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

            {/* Camera viewport (CAMERA mode) */}
            {readerMode === "CAMERA" && (
              <div className="flex-1 relative bg-background min-h-[300px]">
                <div key={scannerSessionId} id={`qr-reader-${scannerSessionId}`} className="w-full h-full" />
                
                {!scannerReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-muted-foreground">Iniciando cámara...</p>
                    </div>
                  </div>
                )}
                
                {scannerReady && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-4 border-primary/50 rounded-2xl" />
                  </div>
                )}
                
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-sm text-muted-foreground bg-background/80 inline-block px-4 py-2 rounded-full">
                    Apunta la cámara al código QR
                  </p>
                </div>
              </div>
            )}

            {/* USB Scanner ready view */}
            {readerMode === "USB_SCANNER" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <Usb className="w-16 h-16 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Modo USB Activo</h2>
                <p className="text-muted-foreground max-w-md mb-4">
                  El escáner USB está listo. Escanea un código QR y se procesará automáticamente.
                </p>
                <div className="text-sm text-muted-foreground bg-muted px-4 py-2 rounded-full">
                  El cursor está enfocado en el campo oculto
                </div>
                
                {debugMode && (
                  <div className="mt-6 p-4 bg-muted rounded-lg text-left text-xs font-mono max-w-sm w-full">
                    <p>Estado: {scanState}</p>
                    <p>Modo: {readerMode}</p>
                    <p>Buffer: {scanBufferRef.current || "(vacío)"}</p>
                    <p>Último: {lastParsedToken || "(ninguno)"}</p>
                    <p>Cámara disponible: {cameraAvailable ? "sí" : "no"}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: History Panel (desktop) / Bottom drawer toggle (mobile) */}
          {selectedBarId && (
            <>
              {/* Desktop: Side panel */}
              <div className="hidden md:flex w-80 lg:w-96 border-l border-border bg-card flex-col">
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <History className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">Historial de sesión</h2>
                  <span className="text-xs text-muted-foreground ml-auto">({scanHistory.length})</span>
                </div>
                <div className="flex-1 p-3 overflow-y-auto">
                  {scanHistory.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Aún no hay canjes en esta sesión.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scanHistory.map((entry) => (
                        <div
                          key={entry.id}
                          className={`p-3 rounded-lg border ${
                            entry.status === "SUCCESS"
                              ? "bg-green-500/10 border-green-500/30"
                              : entry.status === "ALREADY_REDEEMED"
                              ? "bg-orange-500/10 border-orange-500/30"
                              : entry.status === "INSUFFICIENT_STOCK"
                              ? "bg-amber-500/10 border-amber-500/30"
                              : "bg-red-500/10 border-red-500/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${
                                entry.status === "SUCCESS" ? "text-green-700 dark:text-green-400" : 
                                entry.status === "ALREADY_REDEEMED" ? "text-orange-700 dark:text-orange-400" :
                                entry.status === "INSUFFICIENT_STOCK" ? "text-amber-700 dark:text-amber-400" :
                                "text-red-700 dark:text-red-400"
                              }`}>
                                {entry.label}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(entry.time, "HH:mm:ss")} • ...{entry.tokenShort}
                              </p>
                            </div>
                            {entry.status === "SUCCESS" ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            ) : entry.status === "ALREADY_REDEEMED" ? (
                              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                            ) : entry.status === "INSUFFICIENT_STOCK" ? (
                              <Package className="w-5 h-5 text-amber-600 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Mobile: Collapsible history at bottom */}
              {isMobile && (
                <div className="md:hidden border-t border-border bg-card">
                  <details className="group">
                    <summary className="flex items-center justify-between p-3 cursor-pointer list-none">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Historial ({scanHistory.length})</span>
                      </div>
                      <span className="text-xs text-muted-foreground group-open:hidden">Expandir ▼</span>
                      <span className="text-xs text-muted-foreground hidden group-open:inline">Cerrar ▲</span>
                    </summary>
                    <div className="p-3 pt-0 max-h-48 overflow-y-auto">
                      {scanHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aún no hay canjes en esta sesión.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {scanHistory.map((entry) => (
                            <div
                              key={entry.id}
                              className={`p-2 rounded-lg border text-xs ${
                                entry.status === "SUCCESS"
                                  ? "bg-green-500/10 border-green-500/30"
                                  : entry.status === "ALREADY_REDEEMED"
                                  ? "bg-orange-500/10 border-orange-500/30"
                                  : entry.status === "INSUFFICIENT_STOCK"
                                  ? "bg-amber-500/10 border-amber-500/30"
                                  : "bg-red-500/10 border-red-500/30"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-medium truncate ${
                                  entry.status === "SUCCESS" ? "text-green-700 dark:text-green-400" : 
                                  entry.status === "ALREADY_REDEEMED" ? "text-orange-700 dark:text-orange-400" :
                                  entry.status === "INSUFFICIENT_STOCK" ? "text-amber-700 dark:text-amber-400" :
                                  "text-red-700 dark:text-red-400"
                                }`}>
                                  {entry.label}
                                </span>
                                <span className="text-muted-foreground flex-shrink-0">
                                  {format(entry.time, "HH:mm")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Waste Registration Dialog — location locked to current bar */}
      {showWasteDialog && selectedBarId && (
        <WasteRegistrationDialog
          open={showWasteDialog}
          onOpenChange={setShowWasteDialog}
          lockedLocationId={selectedBarId}
          lockedLocationName={selectedBarName}
          onWasteRegistered={() => {
            setShowWasteDialog(false);
          }}
        />
      )}
      </>
    </VenueGuard>
  );
}
