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
import { useOpenBottles, type BottleCheckResult } from "@/hooks/useOpenBottles";
import { useAppSession } from "@/contexts/AppSessionContext";

type MissingItem = { product_name: string; required_qty: number; unit: string };
type DeliverItem = { name: string; quantity: number; addons?: string[] };
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
type BarLocation = { id: string; name: string; type: string };
type ScanHistoryEntry = {
  id: string;
  time: Date;
  status: "SUCCESS" | "ALREADY_REDEEMED" | "EXPIRED" | "INVALID" | "CANCELLED" | "INSUFFICIENT_STOCK" | "ERROR";
  label: string;
  tokenShort: string;
};
type ReaderMode = "USB_SCANNER" | "CAMERA";
type ScanState = "idle" | "processing" | "success" | "error" | "waiting_resume" | "mixer_selection";

const MAX_HISTORY_ENTRIES = 20;
const DEDUPE_WINDOW_MS = 5000;
const RESULT_DISPLAY_MS = 2000;
const PROCESSING_TIMEOUT_MS = 8000;
const USB_AUTO_RESET_MS = 2500;
const READER_MODE_KEY = "bartender_reader_mode";
const WATCHDOG_MS = 10000;

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
  if (deliver.type === "cover" && deliver.name) return { name: deliver.name, quantity: deliver.quantity || 1 };
  if (deliver.type === "menu_items" && deliver.items && deliver.items.length > 0) {
    if (deliver.items.length === 1) return { name: deliver.items[0].name, quantity: deliver.items[0].quantity };
    const totalQty = deliver.items.reduce((sum, item) => sum + item.quantity, 0);
    return { name: deliver.items[0].name, quantity: totalQty };
  }
  return { name: "Pedido", quantity: 1 };
}

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
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const { venue } = useAppSession();
  const currentVenueId = venue?.id ?? "";
  const openBottlesHook = useOpenBottles(currentVenueId, selectedBarId || null);

  const [showWasteDialog, setShowWasteDialog] = useState(false);

  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    const saved = localStorage.getItem(READER_MODE_KEY);
    return (saved === "CAMERA" || saved === "USB_SCANNER") ? saved : "USB_SCANNER";
  });

  const [scannerFrozen, setScannerFrozen] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [scannerSessionId, setScannerSessionId] = useState(0);
  const [scannerReady, setScannerReady] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState("");

  // Debug mode
  const [debugMode, setDebugMode] = useState(false);
  const [lastParsedToken, setLastParsedToken] = useState("");
  const [debugStep, setDebugStep] = useState<string>("idle");
  const debugTapCountRef = useRef(0);
  const debugTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef("");
  const lastDecodedValueRef = useRef<string>("");
  const lastDecodedTimeRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const redeemInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cameraRef = useRef<Html5Qrcode | null>(null);
  // Stable ref to break circular dependency between processToken and checkAndProceedWithBottles
  const checkAndProceedWithBottlesRef = useRef<((token: string, overrides: { slot_index: number; product_id: string }[] | null) => Promise<void>) | null>(null);

  // Timers
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    fetchBarLocations();
    const savedBarId = localStorage.getItem("bartenderBarId");
    if (savedBarId) setSelectedBarId(savedBarId);
  }, []);

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
        if (profile) setUserName(profile.full_name || "");
      }
    };
    fetchUserInfo();
  }, []);

  useEffect(() => {
    if (selectedBarId) localStorage.setItem("bartenderBarId", selectedBarId);
  }, [selectedBarId]);

  useEffect(() => {
    if (isVerified && !showBarSelection && scanState === "idle" && readerMode === "USB_SCANNER") {
      focusScannerInput();
    }
  }, [isVerified, showBarSelection, scanState, readerMode]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (scanState === "idle" && !showManualEntry && readerMode === "USB_SCANNER") focusScannerInput();
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [scanState, showManualEntry, readerMode]);

  // Check URL for debug mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") setDebugMode(true);
  }, []);

  const focusScannerInput = useCallback(() => {
    setTimeout(() => {
      if (scannerInputRef.current && !showManualEntry && readerMode === "USB_SCANNER") {
        scannerInputRef.current.focus();
      }
    }, 50);
  }, [showManualEntry, readerMode]);

  const fetchBarLocations = async () => {
    const { data, error } = await supabase.from("stock_locations").select("*").eq("type", "bar").eq("is_active", true).order("name");
    if (!error && data) {
      setBarLocations(data);
      if (data.length === 1) { setSelectedBarId(data[0].id); setShowBarSelection(false); }
      const savedBarId = localStorage.getItem("bartenderBarId");
      if (savedBarId && data.some(b => b.id === savedBarId)) setSelectedBarId(savedBarId);
    }
  };

  const clearAllTimers = useCallback(() => {
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null; }
    if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
    if (watchdogTimerRef.current) { clearTimeout(watchdogTimerRef.current); watchdogTimerRef.current = null; }
  }, []);

  const transitionToWaitingResume = useCallback((currentMode: ReaderMode) => {
    clearAllTimers();
    if (currentMode === "CAMERA") {
      setScannerFrozen(true);
      if (cameraRef.current) { cameraRef.current.stop().catch(() => {}); cameraRef.current = null; setScannerReady(false); }
      dismissTimerRef.current = setTimeout(() => setScanState("waiting_resume"), RESULT_DISPLAY_MS);
    } else {
      dismissTimerRef.current = setTimeout(() => {
        redeemInFlightRef.current = false;
        isProcessingRef.current = false;
        setScannerFrozen(false);
        setResult(null);
        setScanState("idle");
        setDebugStep("idle");
        scanBufferRef.current = "";
        if (scannerInputRef.current) scannerInputRef.current.value = "";
        focusScannerInput();
      }, USB_AUTO_RESET_MS);
    }
  }, [clearAllTimers, focusScannerInput]);

  const resumeScanning = useCallback(() => {
    clearAllTimers();
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    redeemInFlightRef.current = false;
    isProcessingRef.current = false;
    setScannerFrozen(false);
    lastDecodedValueRef.current = "";
    lastDecodedTimeRef.current = 0;
    setResult(null);
    setDebugStep("idle");
    setScanState("idle");
    scanBufferRef.current = "";
    if (readerMode === "CAMERA") setScannerSessionId(prev => prev + 1);
    if (readerMode === "USB_SCANNER") focusScannerInput();
  }, [clearAllTimers, focusScannerInput, readerMode]);

  const resetToReady = resumeScanning;

  // ─── RELEASE LOCKS ──────────────────────────────────────────────────────────
  // Always call this when the pipeline ends (success, error, cancel, timeout)
  const releaseLocks = useCallback((toState: ScanState = "idle") => {
    if (watchdogTimerRef.current) { clearTimeout(watchdogTimerRef.current); watchdogTimerRef.current = null; }
    isProcessingRef.current = false;
    redeemInFlightRef.current = false;
    setScannerFrozen(false);
    setScanState(toState);
  }, []);

  // ─── REDEEM TOKEN ───────────────────────────────────────────────────────────
  const redeemToken = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null
  ): Promise<RedemptionResult | undefined> => {
    abortControllerRef.current = new AbortController();
    setDebugStep("redeem");
    console.log("[Bar][redeem] Calling redeem_pickup_token RPC", { token: token.slice(-8), bar: selectedBarId });

    try {
      redeemInFlightRef.current = true;

      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: selectedBarId || null,
        p_mixer_overrides: mixerOverrides ? JSON.stringify(mixerOverrides) : null,
      });

      if (abortControllerRef.current?.signal.aborted) { console.log("[Bar][redeem] Aborted"); return undefined; }
      if (error) { console.error("[Bar][redeem] RPC error:", error); throw error; }

      const resultData = data as RedemptionResult;

      if (resultData.error_code === "TOO_FAST") {
        console.log("[Bar][redeem] TOO_FAST - ignoring");
        releaseLocks("idle");
        setDebugStep("idle");
        return undefined;
      }

      console.log("[Bar][redeem] Result:", { success: resultData.success, error_code: resultData.error_code });
      setDebugStep(resultData.success ? "done-success" : "done-error");
      setResult(resultData);

      logAuditEvent({
        action: "redeem_pickup_token",
        status: resultData.success ? "success" : "fail",
        metadata: { token: token.substring(0, 8) + "...", error_code: resultData.error_code, bar_id: selectedBarId },
      });

      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(),
        time: new Date(),
        status: resultData.success ? "SUCCESS" : mapErrorCodeToStatus(resultData.error_code),
        label: generateHistoryLabel(resultData),
        tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));

      // Set final state — setScanState called here so the UI renders BEFORE transitionToWaitingResume
      releaseLocks(resultData.success ? "success" : "error");
      transitionToWaitingResume(readerMode);
      return resultData;

    } catch (err: any) {
      if (abortControllerRef.current?.signal.aborted) return undefined;
      console.error("[Bar][redeem] Catch:", { token: token.slice(-8), err });
      const errMsg = err?.message || "Error al procesar el canje";
      const errorResult: RedemptionResult = { success: false, error_code: "SYSTEM_ERROR", message: errMsg };
      setDebugStep("done-error");
      setResult(errorResult);

      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(), time: new Date(), status: "ERROR",
        label: "ERROR: " + errMsg.slice(0, 40), tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error");
      transitionToWaitingResume(readerMode);
      return errorResult;
    }
    // NOTE: No finally here — releaseLocks() is called explicitly in every path above
    // to avoid releasing locks when transitioning to mixer_selection or bottle_check
  }, [transitionToWaitingResume, selectedBarId, readerMode, releaseLocks]);

  // ─── PROCESS TOKEN (entry point) ────────────────────────────────────────────
  const processToken = useCallback(async (token: string) => {
    const now = Date.now();

    if (isProcessingRef.current) { console.log("[Bar][process] Lock active, ignoring"); return; }
    if (token === lastDecodedValueRef.current && now - lastDecodedTimeRef.current < DEDUPE_WINDOW_MS) { console.log("[Bar][process] Dedupe, ignoring"); return; }
    if (redeemInFlightRef.current) { console.log("[Bar][process] In flight, ignoring"); return; }
    if (scannerFrozen) { console.log("[Bar][process] Frozen, ignoring"); return; }

    // Acquire locks
    isProcessingRef.current = true;
    lastDecodedValueRef.current = token;
    lastDecodedTimeRef.current = now;
    setLastParsedToken(token);
    setScanState("processing");
    setScannerFrozen(true);
    setResult(null);
    setDebugStep("start");
    console.log("[Bar][process] START token:", token.slice(-8));

    if (cameraRef.current) { cameraRef.current.stop().catch(() => {}); cameraRef.current = null; setScannerReady(false); }

    // ─── WATCHDOG 10s ───
    // Only fires if we're still in "processing" (not mixer_selection / bottle_check)
    watchdogTimerRef.current = setTimeout(() => {
      if (!isProcessingRef.current) return;
      console.error("[Bar][watchdog] TIMEOUT after 10s, state still processing");
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const timeoutResult: RedemptionResult = {
        success: false, error_code: "TIMEOUT",
        message: "El canje se quedó esperando. Reintenta o revisa conexión."
      };
      setDebugStep("done-error");
      setResult(timeoutResult);
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(), time: new Date(), status: "ERROR",
        label: "TIMEOUT", tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error");
      transitionToWaitingResume(readerMode);
    }, WATCHDOG_MS);

    try {
      // ── STEP 1: validate token + check mixer requirements ──
      setDebugStep("fetch-token");
      console.log("[Bar][process] Step 1: check_token_mixer_requirements");
      const { data: mixerCheck, error: mixerError } = await supabase.rpc("check_token_mixer_requirements", { p_token: token });
      if (mixerError) { console.error("[Bar][process] mixer check error:", mixerError); throw mixerError; }

      const mixerResult = mixerCheck as unknown as {
        success: boolean;
        requires_mixer_selection: boolean;
        mixer_slots?: MixerSlot[];
        error?: string;
      };
      console.log("[Bar][process] mixer check result:", JSON.stringify(mixerResult));

      if (!mixerResult.success) {
        const errCode = mixerResult.error || "TOKEN_NOT_FOUND";
        console.warn("[Bar][process] mixer check not success:", errCode);
        setDebugStep("done-error");
        setResult({ success: false, error_code: errCode, message: "Token no encontrado o ya procesado" });
        const historyEntry: ScanHistoryEntry = {
          id: crypto.randomUUID(), time: new Date(), status: mapErrorCodeToStatus(errCode),
          label: getErrorTitle(errCode), tokenShort: token.slice(-6),
        };
        setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
        releaseLocks("error");
        transitionToWaitingResume(readerMode);
        return;
      }

      // ── STEP 2: Mixer selection? ──
      if (mixerResult.requires_mixer_selection && mixerResult.mixer_slots && mixerResult.mixer_slots.length > 0) {
        console.log("[Bar][process] Step 2: mixer_selection required, slots:", mixerResult.mixer_slots.length);
        setDebugStep("mixer-needed");
        setMixerSlots(mixerResult.mixer_slots);
        setPendingToken(token);
        // Keep scannerFrozen=true and isProcessingRef=true while user picks mixer
        // releaseLocks NOT called here — will be called by handleMixerConfirm / handleMixerCancel
        if (watchdogTimerRef.current) { clearTimeout(watchdogTimerRef.current); watchdogTimerRef.current = null; }
        setScanState("mixer_selection");
        return;
      }

      // ── STEP 3: Bottle check (if bar selected) ──
      if (selectedBarId) {
        setDebugStep("bottle-check");
        console.log("[Bar][process] Step 3: bottle check via ref");
        await checkAndProceedWithBottlesRef.current?.(token, null);
        return;
      }

      // ── STEP 4: Direct redeem (no bar context) ──
      setDebugStep("redeem");
      console.log("[Bar][process] Step 4: direct redeem (no bar)");
      await redeemToken(token, null);

    } catch (err: any) {
      if (abortControllerRef.current?.signal.aborted) return;
      const errMsg = err?.message || "Error al procesar el código";
      console.error("[Bar][process] Catch:", { token: token.slice(-8), err });
      setDebugStep("done-error");
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: errMsg });
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(), time: new Date(), status: "ERROR",
        label: "ERROR: " + errMsg.slice(0, 40), tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error");
      transitionToWaitingResume(readerMode);
    }
    // NOTE: No finally — locks are released explicitly in every branch above.
    // This prevents accidentally releasing locks when waiting for mixer or bottle dialogs.
  }, [transitionToWaitingResume, selectedBarId, scannerFrozen, readerMode, redeemToken, releaseLocks]);

  const redeemWithBottleDeduction = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null,
    checks: BottleCheckResult[]
  ) => {
    // redeemToken handles lock release internally
    const redeemResult = await redeemToken(token, mixerOverrides);
    if (redeemResult?.success !== true) return;
    // Best-effort bottle deduction — never blocks canje
    for (const check of checks) {
      if (check.required_ml <= 0) continue;
      try {
        await openBottlesHook.deductMl({
          productId: check.product_id,
          mlToDeduct: check.required_ml,
          actorUserId: currentUserId,
          reason: `Canje QR ${token.slice(-6)}`
        });
      } catch (e) {
        console.error("[Bar] Bottle deduction non-blocking:", e);
        toast.warning("Canje OK, pero no se pudo registrar consumo de botella (revisar).");
      }
    }
  }, [redeemToken, openBottlesHook, currentUserId]);

  const checkAndProceedWithBottles = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null
  ) => {
    setDebugStep("bottle-check");
    try {
      if (!selectedBarId) {
        console.warn("[Bar][bottles] No bar selected — redeeming directly");
        await redeemToken(token, mixerOverrides);
        return;
      }

      // Fetch sale_id from token
      const { data: tokenData, error: tokenErr } = await supabase
        .from("pickup_tokens").select("id, sale_id").eq("token", token).maybeSingle();
      if (tokenErr) throw tokenErr;

      if (!tokenData?.sale_id) {
        console.log("[Bar][bottles] No sale_id — redeeming directly");
        await redeemToken(token, mixerOverrides);
        return;
      }

      // Fetch sale items + cocktail ingredients with capacity_ml
      const { data: saleItems, error: siErr } = await supabase
        .from("sale_items")
        .select("quantity, cocktail_id, cocktails:cocktail_id(cocktail_ingredients(quantity, products:product_id(id, name, capacity_ml)))")
        .eq("sale_id", tokenData.sale_id);
      if (siErr) throw siErr;

      // Aggregate ml per product
      const mlMap = new Map<string, { product_id: string; product_name: string; required_ml: number; capacity_ml: number }>();
      for (const si of (saleItems || [])) {
        const qty = (si as any).quantity || 1;
        for (const ing of ((si as any).cocktails?.cocktail_ingredients || [])) {
          const p = ing.products;
          if (!p?.capacity_ml || p.capacity_ml <= 0) continue;
          const ingQty = (ing.quantity || 0) * qty;
          if (ingQty <= 0) continue;
          const ex = mlMap.get(p.id);
          if (ex) { ex.required_ml += ingQty; }
          else { mlMap.set(p.id, { product_id: p.id, product_name: p.name, required_ml: ingQty, capacity_ml: p.capacity_ml }); }
        }
      }

      if (mlMap.size === 0) {
        console.log("[Bar][bottles] No ml ingredients — redeeming directly");
        await redeemToken(token, mixerOverrides);
        return;
      }

      const ingredientsList = Array.from(mlMap.values());
      const checks = openBottlesHook.checkBottlesForIngredients(
        ingredientsList.map(i => ({ product_id: i.product_id, product_name: i.product_name, required_ml: i.required_ml }))
      );

      // ── AUTO-OPEN bottles for any product with insufficient ml ──
      const insufficientChecks = checks.filter(c => !c.sufficient);
      if (insufficientChecks.length > 0) {
        setDebugStep("auto-open");
        if (!currentUserId) throw new Error("Sin usuario activo para abrir botellas");
        if (!currentVenueId) throw new Error("Venue no identificado");

        for (const check of insufficientChecks) {
          const ingData = mlMap.get(check.product_id);
          if (!ingData) continue;
          const { capacity_ml } = ingData;
          if (!capacity_ml || capacity_ml <= 0) {
            throw new Error(`${check.product_name} no tiene capacidad ml definida. No se puede abrir automáticamente.`);
          }
          const missing_ml = check.required_ml - check.available_ml;
          const bottlesNeeded = Math.ceil(missing_ml / capacity_ml);
          console.log(`[Bar][auto-open] ${check.product_name} x${bottlesNeeded} (faltaban ${missing_ml}ml)`);
          toast.info(`Auto-open: ${check.product_name} x${bottlesNeeded} botella${bottlesNeeded > 1 ? "s" : ""} (faltaban ${missing_ml}ml)`);

          for (let i = 0; i < bottlesNeeded; i++) {
            const { data: newBottle, error: insertErr } = await (supabase as any)
              .from("open_bottles")
              .insert({
                venue_id: currentVenueId,
                location_id: selectedBarId,
                product_id: check.product_id,
                status: "OPEN",
                opened_by_user_id: currentUserId,
                initial_ml: capacity_ml,
                remaining_ml: capacity_ml,
                notes: `Auto-abierta por canje ${token.slice(-6)}`,
              })
              .select()
              .single();
            if (insertErr) throw insertErr;

            await (supabase as any).from("open_bottle_events").insert({
              open_bottle_id: newBottle.id,
              event_type: "OPENED",
              delta_ml: capacity_ml,
              before_ml: 0,
              after_ml: capacity_ml,
              actor_user_id: currentUserId,
              reason: "Auto-open por canje",
            });
          }
        }
        // Refresh after auto-open
        await openBottlesHook.fetchBottles();
      }

      // Proceed to redeem with best-effort bottle deduction
      setDebugStep("redeem");
      const checksForDeduction: BottleCheckResult[] = ingredientsList.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        required_ml: i.required_ml,
        available_ml: i.required_ml,
        sufficient: true,
        open_bottles: [],
      }));
      await redeemWithBottleDeduction(token, mixerOverrides, checksForDeduction);

    } catch (err: any) {
      console.error("[Bar][bottles] Error:", { token: token.slice(-8), err });
      const errMsg = err?.message || "Error al verificar botellas";
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: errMsg });
      const historyEntry: ScanHistoryEntry = {
        id: crypto.randomUUID(), time: new Date(), status: "ERROR",
        label: "ERROR: " + errMsg.slice(0, 40), tokenShort: token.slice(-6),
      };
      setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error");
      transitionToWaitingResume(readerMode);
    }
  }, [openBottlesHook, redeemToken, redeemWithBottleDeduction, selectedBarId, currentVenueId, currentUserId, readerMode, transitionToWaitingResume, releaseLocks]);

  // ─── MIXER CONFIRM ──────────────────────────────────────────────────────────
  const handleMixerConfirm = useCallback(async (selections: { slot_index: number; product_id: string }[]) => {
    setIsRedeemingWithMixer(true);
    if (watchdogTimerRef.current) { clearTimeout(watchdogTimerRef.current); watchdogTimerRef.current = null; }
    const token = pendingToken;
    setPendingToken("");
    try {
      if (selectedBarId) {
        setPendingMixerOverrides(selections);
        await checkAndProceedWithBottles(token, selections);
      } else {
        await redeemToken(token, selections);
      }
    } catch (err: any) {
      console.error("[Bar] Mixer confirm error:", err);
      const errMsg = err?.message || "Error al canjear con mixer";
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: errMsg });
      releaseLocks("error");
      transitionToWaitingResume(readerMode);
    } finally {
      setIsRedeemingWithMixer(false);
    }
  }, [pendingToken, redeemToken, selectedBarId, checkAndProceedWithBottles, transitionToWaitingResume, readerMode, releaseLocks]);

  const handleMixerCancel = useCallback(() => {
    if (watchdogTimerRef.current) { clearTimeout(watchdogTimerRef.current); watchdogTimerRef.current = null; }
    setPendingToken("");
    setMixerSlots([]);
    setDebugStep("idle");
    releaseLocks("idle");
    if (readerMode === "CAMERA") setScannerSessionId(prev => prev + 1);
    else focusScannerInput();
  }, [readerMode, focusScannerInput, releaseLocks]);

  // ─── USB SCANNER INPUT ──────────────────────────────────────────────────────
  const handleScannerKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const rawValue = scanBufferRef.current.trim();
      scanBufferRef.current = "";
      if (scannerInputRef.current) scannerInputRef.current.value = "";

      if (!rawValue) return;
      if (scanState !== "idle") {
        console.log("[Bar][USB] Ignoring scan - not idle, state:", scanState);
        return;
      }

      const parsed = parseQRToken(rawValue);
      if (!parsed.valid) {
        const historyEntry: ScanHistoryEntry = {
          id: crypto.randomUUID(), time: new Date(), status: "INVALID",
          label: "QR INVÁLIDO", tokenShort: rawValue.slice(-6) || "??????",
        };
        setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
        transitionToWaitingResume("USB_SCANNER");
        return;
      }

      processToken(parsed.token);
    } else {
      scanBufferRef.current += e.key;
    }
  }, [scanState, transitionToWaitingResume, processToken]);

  // ─── CAMERA SCANNER ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async (sessionId: number) => {
    const elementId = `qr-reader-${sessionId}`;
    let html5QrCode: Html5Qrcode | null = null;

    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) { setCameraAvailable(false); return; }

      const el = document.getElementById(elementId);
      if (!el) return;

      html5QrCode = new Html5Qrcode(elementId);
      cameraRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (scannerFrozen || scanState !== "idle") return;
          const parsed = parseQRToken(decodedText);
          if (!parsed.valid) {
            const historyEntry: ScanHistoryEntry = {
              id: crypto.randomUUID(), time: new Date(), status: "INVALID",
              label: "QR INVÁLIDO", tokenShort: decodedText.slice(-6) || "??????",
            };
            setScanHistory(prev => [historyEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
            transitionToWaitingResume("CAMERA");
            return;
          }
          processToken(parsed.token);
        },
        () => {}
      );
      setScannerReady(true);
    } catch (err: any) {
      console.error("[Bar] Camera error:", err);
      setCameraAvailable(false);
      if (html5QrCode) { html5QrCode.stop().catch(() => {}); cameraRef.current = null; }
    }
  }, [scannerFrozen, scanState, transitionToWaitingResume, processToken]);

  useEffect(() => {
    if (readerMode !== "CAMERA" || showBarSelection || !isVerified || scannerFrozen) return;
    startCamera(scannerSessionId);
    return () => {
      if (cameraRef.current) { cameraRef.current.stop().catch(() => {}); cameraRef.current = null; setScannerReady(false); }
    };
  }, [readerMode, scannerSessionId, showBarSelection, isVerified, scannerFrozen]);

  // ─── MANUAL TOKEN ENTRY ──────────────────────────────────────────────────────
  const handleManualSubmit = useCallback(() => {
    const raw = manualToken.trim();
    if (!raw) return;
    const parsed = parseQRToken(raw);
    if (!parsed.valid) {
      toast.error("Token inválido");
      return;
    }
    setShowManualEntry(false);
    setManualToken("");
    processToken(parsed.token);
  }, [manualToken, processToken]);

  // Debug tap handler
  const handleDebugTap = useCallback(() => {
    debugTapCountRef.current += 1;
    if (debugTapTimerRef.current) clearTimeout(debugTapTimerRef.current);
    debugTapTimerRef.current = setTimeout(() => { debugTapCountRef.current = 0; }, 2000);
    if (debugTapCountRef.current >= 5) { setDebugMode(prev => !prev); debugTapCountRef.current = 0; }
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  if (showPinDialog) {
    return (
      <WorkerPinDialog
        open={showPinDialog}
        onVerified={() => { setShowPinDialog(false); setIsVerified(true); }}
        onCancel={() => navigate("/")}
      />
    );
  }

  if (showBarSelection && barLocations.length > 1) {
    return (
      <VenueGuard>
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="p-6 w-full max-w-sm space-y-4">
            <div className="text-center">
              <MapPin className="w-10 h-10 text-primary mx-auto mb-2" />
              <h2 className="text-xl font-bold">Seleccionar Barra</h2>
              <p className="text-sm text-muted-foreground">¿Desde qué barra estás canjeando?</p>
            </div>
            <div className="space-y-2">
              {barLocations.map(bar => (
                <Button key={bar.id} variant="outline" className="w-full justify-start" onClick={() => { setSelectedBarId(bar.id); setShowBarSelection(false); }}>
                  <MapPin className="w-4 h-4 mr-2" />
                  {bar.name}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="w-full text-sm" onClick={() => setShowBarSelection(false)}>
              Continuar sin seleccionar barra
            </Button>
          </Card>
        </div>
      </VenueGuard>
    );
  }

  const delivery = getDeliveryDisplay(result?.deliver);

  return (
    <VenueGuard>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-card">
          <div className="flex items-center gap-2" onClick={handleDebugTap}>
            <ScanLine className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Lector QR Bar</span>
            {selectedBarId && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {barLocations.find(b => b.id === selectedBarId)?.name || "Barra"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <VenueIndicator />
            {userName && <span className="text-xs text-muted-foreground hidden sm:block">{userName}</span>}
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Debug overlay */}
        {debugMode && (
          <div className="fixed bottom-2 left-2 z-50 bg-black/80 text-green-400 text-xs font-mono p-2 rounded max-w-xs">
            <div>state: <span className="text-yellow-300">{scanState}</span></div>
            <div>step: <span className="text-cyan-300">{debugStep}</span></div>
            <div>token: <span className="text-white">{lastParsedToken.slice(-10) || "—"}</span></div>
            <div>frozen: <span className="text-orange-300">{scannerFrozen ? "YES" : "no"}</span></div>
            <div>processing: <span className="text-red-300">{isProcessingRef.current ? "YES" : "no"}</span></div>
          </div>
        )}

        {/* Reader mode selector */}
        <div className="flex justify-center pt-3 pb-1">
          <ToggleGroup type="single" value={readerMode} onValueChange={(v) => { if (v) { setReaderMode(v as ReaderMode); localStorage.setItem(READER_MODE_KEY, v); resumeScanning(); } }}>
            <ToggleGroupItem value="USB_SCANNER" className="gap-1.5 text-xs">
              <Usb className="w-3.5 h-3.5" /> Scanner USB
            </ToggleGroupItem>
            <ToggleGroupItem value="CAMERA" className="gap-1.5 text-xs">
              <Camera className="w-3.5 h-3.5" /> Cámara
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">

          {/* IDLE state - USB */}
          {scanState === "idle" && readerMode === "USB_SCANNER" && (
            <div className="w-full max-w-sm space-y-4 text-center">
              <div className="border-2 border-dashed border-primary/30 rounded-xl p-8">
                <Usb className="w-12 h-12 text-primary/50 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Listo para escanear</p>
                <p className="text-xs text-muted-foreground mt-1">Apunta el lector al código QR</p>
              </div>
              <input
                ref={scannerInputRef}
                className="opacity-0 absolute -left-full"
                onKeyDown={handleScannerKeyDown}
                onChange={(e) => { scanBufferRef.current = e.target.value; }}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden
              />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowManualEntry(true)}>
                <Keyboard className="w-4 h-4" /> Ingresar manualmente
              </Button>
            </div>
          )}

          {/* IDLE state - CAMERA */}
          {scanState === "idle" && readerMode === "CAMERA" && (
            <div className="w-full max-w-sm space-y-3">
              <div id={`qr-reader-${scannerSessionId}`} className="rounded-xl overflow-hidden border" />
              {!scannerReady && (
                <div className="text-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Iniciando cámara...</p>
                </div>
              )}
              {!cameraAvailable && (
                <div className="text-center py-4">
                  <XCircle className="w-6 h-6 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-destructive">Cámara no disponible</p>
                </div>
              )}
            </div>
          )}

          {/* PROCESSING state */}
          {scanState === "processing" && (
            <div className="text-center space-y-4">
              <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
              <div>
                <p className="text-lg font-semibold">Validando...</p>
                {debugMode && <p className="text-xs text-muted-foreground mt-1">paso: {debugStep}</p>}
              </div>
            </div>
          )}

          {/* SUCCESS state */}
          {scanState === "success" && result?.success && (
            <div className="w-full max-w-sm text-center space-y-4">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
              <div>
                <p className="text-3xl font-black text-green-500">ENTREGAR</p>
                <p className="text-2xl font-bold mt-2">{delivery.name}</p>
                <p className="text-4xl font-black text-primary">x{delivery.quantity}</p>
                {result.deliver?.source && (
                  <p className="text-sm text-muted-foreground mt-1">{getSourceLabel(result.deliver.source)}</p>
                )}
              </div>
              {result.deliver?.type === "menu_items" && result.deliver.items && result.deliver.items.length > 1 && (
                <div className="bg-muted rounded-lg p-3 text-left space-y-1">
                  {result.deliver.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.name}</span>
                      <span className="font-bold">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ERROR state */}
          {scanState === "error" && (
            <div className="w-full max-w-sm text-center space-y-4">
              {result?.error_code === "ALREADY_REDEEMED" ? (
                <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto" />
              ) : (
                <XCircle className="w-20 h-20 text-destructive mx-auto" />
              )}
              <div>
                <p className="text-2xl font-black text-destructive">{getErrorTitle(result?.error_code)}</p>
                {result?.message && <p className="text-sm text-muted-foreground mt-2 break-words">{result.message}</p>}
              </div>
              <Button variant="outline" onClick={resumeScanning} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Reintentar
              </Button>
            </div>
          )}

          {/* WAITING_RESUME state */}
          {scanState === "waiting_resume" && (
            <div className="text-center space-y-4">
              {result?.success ? (
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
              ) : (
                <XCircle className="w-16 h-16 text-destructive mx-auto" />
              )}
              <Button onClick={resumeScanning} className="gap-2">
                <ScanLine className="w-4 h-4" /> Escanear siguiente
              </Button>
            </div>
          )}

          {/* MIXER_SELECTION state */}
          {scanState === "mixer_selection" && (
            <div className="text-center space-y-3">
              <Package className="w-12 h-12 text-primary mx-auto" />
              <p className="font-semibold">Seleccionando mixer...</p>
            </div>
          )}




          {/* Manual entry */}
          {showManualEntry && (
            <div className="w-full max-w-sm space-y-3">
              <Input
                placeholder="Ingresa el token o URL del QR"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowManualEntry(false); setManualToken(""); }}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleManualSubmit}>
                  Canjear
                </Button>
              </div>
            </div>
          )}

          {/* Bar change button */}
          {barLocations.length > 1 && (
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 mt-2" onClick={() => setShowBarSelection(true)}>
              <MapPin className="w-3.5 h-3.5" />
              Cambiar barra
            </Button>
          )}

          {/* Scan history */}
          {scanHistory.length > 0 && (
            <div className="w-full max-w-sm mt-4">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Historial reciente</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {scanHistory.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {entry.status === "SUCCESS" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : entry.status === "ALREADY_REDEEMED" ? (
                        <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      <span className="truncate font-medium">{entry.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-muted-foreground">{entry.tokenShort}</span>
                      <span className="text-muted-foreground">
                        {format(entry.time, "HH:mm", { locale: es })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waste button */}
          <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground" onClick={() => setShowWasteDialog(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Registrar merma
          </Button>
        </div>

        {/* Dialogs */}
        {scanState === "mixer_selection" && (
          <MixerSelectionDialog
            mixerSlots={mixerSlots}
            isLoading={isRedeemingWithMixer}
            onConfirm={handleMixerConfirm}
            onCancel={handleMixerCancel}
          />
        )}




        <WasteRegistrationDialog
          open={showWasteDialog}
          onOpenChange={setShowWasteDialog}
          onWasteRegistered={() => setShowWasteDialog(false)}
        />
      </div>
    </VenueGuard>
  );
}
