import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2, LogOut, CheckCircle2, XCircle, AlertCircle, Keyboard,
  RefreshCw, MapPin, Package, Trash2, History, QrCode, Bluetooth,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { logAuditEvent } from "@/lib/monitoring";
import { VenueGuard } from "@/components/VenueGuard";
import { VenueIndicator } from "@/components/VenueIndicator";
import { MixerSelectionDialog, type MixerSlot } from "@/components/bar/MixerSelectionDialog";
import { WasteRegistrationDialog } from "@/components/dashboard/WasteRegistrationDialog";
import { useOpenBottles, type BottleCheckResult } from "@/hooks/useOpenBottles";
import { useAppSession } from "@/contexts/AppSessionContext";

// ── Types ──────────────────────────────────────────────────────────────────────
type DeliverItem = { name: string; quantity: number; addons?: string[] };
type DeliverInfo = {
  type: "cover" | "menu_items";
  name?: string;
  quantity?: number;
  items?: DeliverItem[];
  source: "sale" | "ticket";
};
type RedemptionResult = {
  success: boolean;
  error_code?: string;
  message: string;
  deliver?: DeliverInfo;
  bar_location?: { id: string; name: string };
};
type BarLocation = { id: string; name: string; type: string };
type ScanHistoryEntry = {
  id: string;
  time: Date;
  status: "SUCCESS" | "ALREADY_REDEEMED" | "EXPIRED" | "INVALID" | "CANCELLED" | "INSUFFICIENT_STOCK" | "ERROR";
  label: string;
  tokenShort: string;
};
type ScanState = "idle" | "processing" | "success" | "error" | "mixer_selection";

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_HISTORY_ENTRIES = 20;
const DEDUPE_WINDOW_MS = 5000;
const AUTO_RESET_MS = 2500;
const WATCHDOG_MS = 10000;

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseQRToken(raw: string): { valid: boolean; token: string } {
  const trimmed = raw.trim();
  let token = "";
  if (trimmed.includes("token=")) {
    const m = trimmed.match(/[?&]token=([a-f0-9]+)/i); if (m) token = m[1];
  } else if (trimmed.includes("/r/")) {
    const m = trimmed.match(/\/r\/([a-f0-9]+)/i); if (m) token = m[1];
  } else if (trimmed.toUpperCase().startsWith("PICKUP:")) {
    token = trimmed.substring(7);
  } else {
    const m = trimmed.match(/[a-f0-9]{12,64}/i); if (m) token = m[0];
  }
  token = token.toLowerCase();
  if (token.length >= 12 && token.length <= 64 && /^[a-f0-9]+$/.test(token)) return { valid: true, token };
  return { valid: false, token: "" };
}

function getErrorTitle(code?: string): string {
  switch (code) {
    case "ALREADY_REDEEMED": return "YA CANJEADO";
    case "TOKEN_EXPIRED": return "EXPIRADO";
    case "PAYMENT_NOT_CONFIRMED": return "PAGO NO CONFIRMADO";
    case "SALE_CANCELLED": return "VENTA CANCELADA";
    case "QR_INVALID": return "QR INVÁLIDO";
    case "TOKEN_NOT_FOUND": return "NO ENCONTRADO";
    case "TIMEOUT": return "TIEMPO AGOTADO";
    case "WRONG_BAR": return "BARRA INCORRECTA";
    case "INSUFFICIENT_BAR_STOCK": return "SIN STOCK EN ESTA BARRA";
    default: return "ERROR";
  }
}

function getSourceLabel(s: string) { return s === "ticket" ? "Cover" : "Caja"; }

function getDelivery(deliver?: DeliverInfo): { name: string; quantity: number } {
  if (!deliver) return { name: "Pedido", quantity: 1 };
  if (deliver.type === "cover" && deliver.name) return { name: deliver.name, quantity: deliver.quantity || 1 };
  if (deliver.type === "menu_items" && deliver.items?.length) {
    if (deliver.items.length === 1) return { name: deliver.items[0].name, quantity: deliver.items[0].quantity };
    return { name: deliver.items[0].name, quantity: deliver.items.reduce((s, i) => s + i.quantity, 0) };
  }
  return { name: "Pedido", quantity: 1 };
}

function mapStatus(code?: string): ScanHistoryEntry["status"] {
  switch (code) {
    case "ALREADY_REDEEMED": return "ALREADY_REDEEMED";
    case "TOKEN_EXPIRED": return "EXPIRED";
    case "QR_INVALID": case "TOKEN_NOT_FOUND": return "INVALID";
    case "SALE_CANCELLED": return "CANCELLED";
    case "INSUFFICIENT_BAR_STOCK": case "INSUFFICIENT_STOCK": return "INSUFFICIENT_STOCK";
    default: return "ERROR";
  }
}

function historyLabel(r: RedemptionResult): string {
  if (r.success) { const d = getDelivery(r.deliver); return `ENTREGAR: ${d.name} x${d.quantity}`; }
  switch (r.error_code) {
    case "ALREADY_REDEEMED": return "YA CANJEADO";
    case "TOKEN_EXPIRED": return "VENCIDO";
    case "QR_INVALID": return "QR INVÁLIDO";
    case "TOKEN_NOT_FOUND": return "NO ENCONTRADO";
    case "SALE_CANCELLED": return "CANCELADO";
    case "INSUFFICIENT_BAR_STOCK": case "INSUFFICIENT_STOCK": return "SIN STOCK";
    case "TIMEOUT": return "TIMEOUT";
    default: return r.message || "ERROR";
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Bar() {
  const navigate = useNavigate();

  // Session
  const [isVerified, setIsVerified] = useState(true);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [userName, setUserName] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const { venue } = useAppSession();
  const currentVenueId = venue?.id ?? "";

  // Scanner
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [scannerFrozen, setScannerFrozen] = useState(false);
  const [processingHint, setProcessingHint] = useState(false);

  // Mixer
  const [mixerSlots, setMixerSlots] = useState<MixerSlot[]>([]);
  const [pendingToken, setPendingToken] = useState("");
  const [pendingCocktailName, setPendingCocktailName] = useState<string | undefined>(undefined);
  const [pendingMixerOverrides, setPendingMixerOverrides] = useState<{ slot_index: number; product_id: string }[] | null>(null);
  const [isRedeemingWithMixer, setIsRedeemingWithMixer] = useState(false);

  // Bar selection
  const [barLocations, setBarLocations] = useState<BarLocation[]>([]);
  const [selectedBarId, setSelectedBarId] = useState("");
  const [showBarSelection, setShowBarSelection] = useState(true);

  // Bottles
  const openBottlesHook = useOpenBottles(currentVenueId, selectedBarId || null);

  // UI
  const [showWasteDialog, setShowWasteDialog] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState("");

  // Debug
  const [debugMode, setDebugMode] = useState(false);
  const [lastParsedToken, setLastParsedToken] = useState("");
  const [debugStep, setDebugStep] = useState("idle");
  const debugTapRef = useRef(0);
  const debugTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef("");
  const lastTokenRef = useRef("");
  const lastTimeRef = useRef(0);
  const isProcessingRef = useRef(false);
  const redeemInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const checkBottlesRef = useRef<((t: string, o: { slot_index: number; product_id: string }[] | null) => Promise<void>) | null>(null);
  const dismissRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const hintRef = useRef<NodeJS.Timeout | null>(null);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("stock_locations").select("*").eq("type", "bar").eq("is_active", true).order("name").then(({ data }) => {
      if (!data) return;
      setBarLocations(data);
      const saved = localStorage.getItem("bartenderBarId");
      if (saved && data.some((b: BarLocation) => b.id === saved)) { setSelectedBarId(saved); setShowBarSelection(false); }
      else if (data.length === 1) { setSelectedBarId(data[0].id); setShowBarSelection(false); }
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setCurrentUserId(user.id);
      supabase.from("profiles").select("full_name").eq("id", user.id).single().then(({ data }) => {
        if (data) setUserName(data.full_name || "");
      });
    });
  }, []);

  useEffect(() => { if (selectedBarId) localStorage.setItem("bartenderBarId", selectedBarId); }, [selectedBarId]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("debug") === "1") setDebugMode(true); }, []);

  // Processing hint after 2s
  useEffect(() => {
    if (scanState === "processing") {
      hintRef.current = setTimeout(() => setProcessingHint(true), 2000);
    } else {
      if (hintRef.current) { clearTimeout(hintRef.current); hintRef.current = null; }
      setProcessingHint(false);
    }
    return () => { if (hintRef.current) { clearTimeout(hintRef.current); hintRef.current = null; } };
  }, [scanState]);

  // ── Focus ──────────────────────────────────────────────────────────────────
  const focusInput = useCallback(() => {
    setTimeout(() => {
      if (!showManualEntry && !showBarSelection && !showWasteDialog) {
        scannerInputRef.current?.focus();
      }
    }, 80);
  }, [showManualEntry, showBarSelection, showWasteDialog]);

  useEffect(() => {
    if (!showBarSelection && !showManualEntry && !showWasteDialog && scanState === "idle") focusInput();
  }, [showBarSelection, showManualEntry, showWasteDialog, scanState, focusInput]);

  // ── Lock helpers ───────────────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    [dismissRef, watchdogRef, hintRef].forEach(r => { if (r.current) { clearTimeout(r.current); r.current = null; } });
  }, []);

  const releaseLocks = useCallback((to: ScanState = "idle") => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    isProcessingRef.current = false;
    redeemInFlightRef.current = false;
    setScannerFrozen(false);
    setScanState(to);
  }, []);

  const resumeScanning = useCallback(() => {
    clearTimers();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    redeemInFlightRef.current = false;
    isProcessingRef.current = false;
    setScannerFrozen(false);
    lastTokenRef.current = "";
    lastTimeRef.current = 0;
    setResult(null);
    setDebugStep("idle");
    setScanState("idle");
    scanBufferRef.current = "";
    setTimeout(focusInput, 100);
  }, [clearTimers, focusInput]);

  const scheduleAutoReset = useCallback(() => {
    clearTimers();
    dismissRef.current = setTimeout(() => {
      redeemInFlightRef.current = false;
      isProcessingRef.current = false;
      setScannerFrozen(false);
      setResult(null);
      setScanState("idle");
      setDebugStep("idle");
      scanBufferRef.current = "";
      if (scannerInputRef.current) scannerInputRef.current.value = "";
      focusInput();
    }, AUTO_RESET_MS);
  }, [clearTimers, focusInput]);

  // ── Redeem token ───────────────────────────────────────────────────────────
  const redeemToken = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null
  ): Promise<RedemptionResult | undefined> => {
    abortRef.current = new AbortController();
    setDebugStep("redeem");
    try {
      redeemInFlightRef.current = true;
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: selectedBarId || null,
        p_mixer_overrides: mixerOverrides ? JSON.stringify(mixerOverrides) : null,
      });
      if (abortRef.current?.signal.aborted) return undefined;
      if (error) throw error;
      const r = data as RedemptionResult;
      if (r.error_code === "TOO_FAST") { releaseLocks("idle"); setDebugStep("idle"); return undefined; }
      setDebugStep(r.success ? "done-success" : "done-error");
      setResult(r);
      logAuditEvent({ action: "redeem_pickup_token", status: r.success ? "success" : "fail", metadata: { token: token.slice(0, 8) + "...", error_code: r.error_code, bar_id: selectedBarId } });
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: r.success ? "SUCCESS" : mapStatus(r.error_code), label: historyLabel(r), tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks(r.success ? "success" : "error");
      scheduleAutoReset();
      return r;
    } catch (err: any) {
      if (abortRef.current?.signal.aborted) return undefined;
      const msg = err?.message || "Error al procesar el canje";
      const er: RedemptionResult = { success: false, error_code: "SYSTEM_ERROR", message: msg };
      setDebugStep("done-error"); setResult(er);
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "ERROR", label: "ERROR: " + msg.slice(0, 40), tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error"); scheduleAutoReset(); return er;
    }
  }, [selectedBarId, releaseLocks, scheduleAutoReset]);

  // ── Best-effort bottle deduction ───────────────────────────────────────────
  const redeemWithBottleDeduction = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null,
    checks: BottleCheckResult[]
  ) => {
    const r = await redeemToken(token, mixerOverrides);
    if (r?.success !== true) return;
    for (const c of checks) {
      if (c.required_ml <= 0) continue;
      try {
        await openBottlesHook.deductMl({ productId: c.product_id, mlToDeduct: c.required_ml, actorUserId: currentUserId, reason: `Canje QR ${token.slice(-6)}` });
      } catch (e) {
        console.error("[Bar] Bottle deduction non-blocking:", e);
        toast.warning("Canje OK, pero no se pudo registrar consumo de botella (revisar).");
      }
    }
  }, [redeemToken, openBottlesHook, currentUserId]);

  // ── Check & auto-open bottles ──────────────────────────────────────────────
  const checkAndProceedWithBottles = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null
  ) => {
    setDebugStep("bottle-check");
    try {
      if (!selectedBarId) { await redeemToken(token, mixerOverrides); return; }

      const { data: td, error: te } = await supabase.from("pickup_tokens").select("id, sale_id").eq("token", token).maybeSingle();
      if (te) throw te;
      if (!td?.sale_id) { await redeemToken(token, mixerOverrides); return; }

      const { data: si, error: se } = await supabase.from("sale_items")
        .select("quantity, cocktail_id, cocktails:cocktail_id(cocktail_ingredients(quantity, products:product_id(id, name, capacity_ml)))")
        .eq("sale_id", td.sale_id);
      if (se) throw se;

      const mlMap = new Map<string, { product_id: string; product_name: string; required_ml: number; capacity_ml: number }>();
      for (const item of (si || [])) {
        const qty = (item as any).quantity || 1;
        for (const ing of ((item as any).cocktails?.cocktail_ingredients || [])) {
          const p = ing.products;
          if (!p?.capacity_ml || p.capacity_ml <= 0) continue;
          const ingQty = (ing.quantity || 0) * qty;
          if (ingQty <= 0) continue;
          const ex = mlMap.get(p.id);
          if (ex) ex.required_ml += ingQty;
          else mlMap.set(p.id, { product_id: p.id, product_name: p.name, required_ml: ingQty, capacity_ml: p.capacity_ml });
        }
      }

      if (mlMap.size === 0) { await redeemToken(token, mixerOverrides); return; }

      const ingredients = Array.from(mlMap.values());
      const checks = openBottlesHook.checkBottlesForIngredients(ingredients.map(i => ({ product_id: i.product_id, product_name: i.product_name, required_ml: i.required_ml })));
      const insufficient = checks.filter(c => !c.sufficient);

      if (insufficient.length > 0) {
        setDebugStep("auto-open");
        if (!currentUserId) throw new Error("Sin usuario activo para abrir botellas");
        if (!currentVenueId) throw new Error("Venue no identificado");
        for (const check of insufficient) {
          const ing = mlMap.get(check.product_id);
          if (!ing) continue;
          const { capacity_ml } = ing;
          if (!capacity_ml || capacity_ml <= 0) throw new Error(`${check.product_name} no tiene capacidad ml definida.`);
          const missing = check.required_ml - check.available_ml;
          const count = Math.ceil(missing / capacity_ml);
          console.log(`[Bar][auto-open] ${check.product_name} x${count} (faltaban ${missing}ml)`);
          toast.info(`Auto-open: ${check.product_name} ×${count} botella${count > 1 ? "s" : ""} (faltaban ${missing}ml)`);
          for (let i = 0; i < count; i++) {
            const { data: nb, error: ie } = await (supabase as any).from("open_bottles").insert({
              venue_id: currentVenueId, location_id: selectedBarId, product_id: check.product_id,
              status: "OPEN", opened_by_user_id: currentUserId,
              initial_ml: capacity_ml, remaining_ml: capacity_ml,
              notes: `Auto-abierta por canje ${token.slice(-6)}`,
            }).select().single();
            if (ie) throw ie;
            await (supabase as any).from("open_bottle_events").insert({
              open_bottle_id: nb.id, event_type: "OPENED", delta_ml: capacity_ml,
              before_ml: 0, after_ml: capacity_ml, actor_user_id: currentUserId, reason: "Auto-open por canje",
            });
          }
        }
        await openBottlesHook.fetchBottles();
      }

      setDebugStep("redeem");
      const forDeduction: BottleCheckResult[] = ingredients.map(i => ({ product_id: i.product_id, product_name: i.product_name, required_ml: i.required_ml, available_ml: i.required_ml, sufficient: true, open_bottles: [] }));
      await redeemWithBottleDeduction(token, mixerOverrides, forDeduction);
    } catch (err: any) {
      const msg = err?.message || "Error al verificar botellas";
      console.error("[Bar][bottles]", err);
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: msg });
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "ERROR", label: "ERROR: " + msg.slice(0, 40), tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error"); scheduleAutoReset();
    }
  }, [openBottlesHook, redeemToken, redeemWithBottleDeduction, selectedBarId, currentVenueId, currentUserId, releaseLocks, scheduleAutoReset]);

  checkBottlesRef.current = checkAndProceedWithBottles;

  // ── Process token (entry point) ────────────────────────────────────────────
  const processToken = useCallback(async (token: string) => {
    const now = Date.now();
    if (isProcessingRef.current || redeemInFlightRef.current || scannerFrozen) return;
    if (token === lastTokenRef.current && now - lastTimeRef.current < DEDUPE_WINDOW_MS) return;

    isProcessingRef.current = true;
    lastTokenRef.current = token;
    lastTimeRef.current = now;
    setLastParsedToken(token);
    setScanState("processing");
    setScannerFrozen(true);
    setResult(null);
    setDebugStep("start");

    watchdogRef.current = setTimeout(() => {
      if (!isProcessingRef.current) return;
      if (abortRef.current) abortRef.current.abort();
      const r: RedemptionResult = { success: false, error_code: "TIMEOUT", message: "El canje se quedó esperando. Reintenta o revisa conexión." };
      setDebugStep("done-error"); setResult(r);
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "ERROR", label: "TIMEOUT", tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error"); scheduleAutoReset();
    }, WATCHDOG_MS);

    try {
      setDebugStep("fetch-token");
      const { data: mc, error: me } = await supabase.rpc("check_token_mixer_requirements", { p_token: token });
      if (me) throw me;
      const mr = mc as unknown as { success?: boolean; requires_mixer_selection: boolean; mixer_slots?: MixerSlot[]; cocktail_id?: string; error?: string };

      if (mr.success === false || mr.error) {
        const code = mr.error || "TOKEN_NOT_FOUND";
        setDebugStep("done-error");
        setResult({ success: false, error_code: code, message: "Token no encontrado o ya procesado" });
        const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: mapStatus(code), label: getErrorTitle(code), tokenShort: token.slice(-6) };
        setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
        releaseLocks("error"); scheduleAutoReset(); return;
      }

      if (mr.requires_mixer_selection && mr.mixer_slots?.length) {
        setDebugStep("mixer-needed");
        setMixerSlots(mr.mixer_slots);
        setPendingToken(token);
        // Get cocktail name for display if available
        if (mr.cocktail_id) {
          supabase.from("cocktails").select("name").eq("id", mr.cocktail_id).single()
            .then(({ data }) => { if (data) setPendingCocktailName(data.name); });
        }
        if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
        setScanState("mixer_selection"); return;
      }

      if (selectedBarId) { await checkBottlesRef.current?.(token, null); return; }
      await redeemToken(token, null);
    } catch (err: any) {
      if (abortRef.current?.signal.aborted) return;
      const msg = err?.message || "Error al procesar el código";
      setDebugStep("done-error");
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: msg });
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "ERROR", label: "ERROR: " + msg.slice(0, 40), tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error"); scheduleAutoReset();
    }
  }, [selectedBarId, scannerFrozen, redeemToken, releaseLocks, scheduleAutoReset]);

  // ── Mixer handlers ─────────────────────────────────────────────────────────
  const handleMixerConfirm = useCallback(async (selections: { slot_index: number; product_id: string }[]) => {
    setIsRedeemingWithMixer(true);
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    const token = pendingToken;
    setPendingToken("");
    try {
      if (selectedBarId) { setPendingMixerOverrides(selections); await checkAndProceedWithBottles(token, selections); }
      else await redeemToken(token, selections);
    } catch (err: any) {
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: err?.message || "Error con mixer" });
      releaseLocks("error"); scheduleAutoReset();
    } finally { setIsRedeemingWithMixer(false); }
  }, [pendingToken, selectedBarId, checkAndProceedWithBottles, redeemToken, releaseLocks, scheduleAutoReset]);

  const handleMixerCancel = useCallback(() => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    setPendingToken(""); setMixerSlots([]); setPendingCocktailName(undefined);
    setDebugStep("idle"); releaseLocks("idle"); focusInput();
  }, [releaseLocks, focusInput]);

  // ── Bluetooth HID keyboard input ───────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const raw = scanBufferRef.current.trim();
      scanBufferRef.current = "";
      if (scannerInputRef.current) scannerInputRef.current.value = "";
      if (!raw || scanState !== "idle") return;
      const parsed = parseQRToken(raw);
      if (!parsed.valid) {
        const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "INVALID", label: "QR INVÁLIDO", tokenShort: raw.slice(-6) || "??????" };
        setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
        return;
      }
      processToken(parsed.token);
    } else {
      scanBufferRef.current += e.key;
    }
  }, [scanState, processToken]);

  // ── Manual submit ──────────────────────────────────────────────────────────
  const handleManualSubmit = useCallback(() => {
    const raw = manualToken.trim();
    if (!raw) return;
    const parsed = parseQRToken(raw);
    if (!parsed.valid) { toast.error("Token inválido"); return; }
    setShowManualEntry(false); setManualToken("");
    processToken(parsed.token);
  }, [manualToken, processToken]);

  const handleDebugTap = useCallback(() => {
    debugTapRef.current += 1;
    if (debugTapTimerRef.current) clearTimeout(debugTapTimerRef.current);
    debugTapTimerRef.current = setTimeout(() => { debugTapRef.current = 0; }, 2000);
    if (debugTapRef.current >= 5) { setDebugMode(p => !p); debugTapRef.current = 0; }
  }, []);

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/auth"); };

  // ── Derived ────────────────────────────────────────────────────────────────
  const delivery = getDelivery(result?.deliver);
  const barName = barLocations.find(b => b.id === selectedBarId)?.name;

  // ── Render: PIN ────────────────────────────────────────────────────────────
  if (showPinDialog) {
    return <WorkerPinDialog open={showPinDialog} onVerified={() => { setShowPinDialog(false); setIsVerified(true); }} onCancel={() => navigate("/")} />;
  }

  // ── Render: Bar selection ──────────────────────────────────────────────────
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
                <Button key={bar.id} variant="outline" className="w-full justify-start h-14 text-base" onClick={() => { setSelectedBarId(bar.id); setShowBarSelection(false); }}>
                  <MapPin className="w-5 h-5 mr-3" />{bar.name}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="w-full text-sm" onClick={() => setShowBarSelection(false)}>Continuar sin barra</Button>
          </Card>
        </div>
      </VenueGuard>
    );
  }

  // ── Status badge config ────────────────────────────────────────────────────
  const badgeCfg: Record<ScanState, { ring: string; dot: string; label: string; pulse: boolean }> = {
    idle:            { ring: "border-primary/30 text-primary bg-primary/5",         dot: "bg-primary",     label: "Bluetooth activo",       pulse: true  },
    processing:      { ring: "border-yellow-500/40 text-yellow-400 bg-yellow-500/5", dot: "bg-yellow-400",  label: "Validando...",            pulse: true  },
    mixer_selection: { ring: "border-blue-400/40 text-blue-400 bg-blue-500/5",       dot: "bg-blue-400",    label: "Selecciona mixer",        pulse: false },
    success:         { ring: "border-primary/40 text-primary bg-primary/10",         dot: "bg-primary",     label: "Canje exitoso",           pulse: false },
    error:           { ring: "border-destructive/40 text-destructive bg-destructive/5", dot: "bg-destructive", label: getErrorTitle(result?.error_code), pulse: false },
  };
  const badge = badgeCfg[scanState];

  // ── Render: Main ───────────────────────────────────────────────────────────
  return (
    <VenueGuard>
      <div className="min-h-screen bg-background flex flex-col select-none" onClick={focusInput}>

        {/* Always-focused BT input */}
        <input
          ref={scannerInputRef}
          className="fixed -left-[9999px] w-px h-px opacity-0 pointer-events-none"
          onKeyDown={handleKeyDown}
          onChange={e => { scanBufferRef.current = e.target.value; }}
          onBlur={() => {
            setTimeout(() => {
              if (document.activeElement === document.body || document.activeElement === null) {
                scannerInputRef.current?.focus();
              }
            }, 200);
          }}
          autoFocus
          autoComplete="off"
          inputMode="none"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* ── Header ── */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/80 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3" onClick={handleDebugTap}>
            <Bluetooth className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Lector QR Bar</span>
            {barName && <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">{barName}</span>}
          </div>
          <div className="flex items-center gap-2">
            <VenueIndicator />
            {userName && <span className="text-xs text-muted-foreground hidden sm:block">{userName}</span>}
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col items-center justify-center gap-8 p-6">

          {/* State icon */}
          <div className="relative">
            {scanState === "idle" && (
              <div className="relative">
                <QrCode className="w-28 h-28 text-primary/60" />
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <Bluetooth className="w-4 h-4 text-primary-foreground" />
                </div>
              </div>
            )}
            {scanState === "processing" && <Loader2 className="w-28 h-28 animate-spin text-primary" />}
            {scanState === "success" && <CheckCircle2 className="w-28 h-28 text-primary" />}
            {scanState === "error" && (result?.error_code === "ALREADY_REDEEMED"
              ? <AlertCircle className="w-28 h-28 text-yellow-500" />
              : <XCircle className="w-28 h-28 text-destructive" />)}
            {scanState === "mixer_selection" && <Package className="w-28 h-28 text-primary" />}
          </div>

          {/* State text */}
          <div className="text-center space-y-3 max-w-xs w-full">
            {scanState === "idle" && (
              <>
                <h1 className="text-2xl font-bold tracking-tight">Listo para escanear</h1>
                <p className="text-muted-foreground text-base leading-relaxed">Escanea un código QR con el lector Bluetooth</p>
              </>
            )}
            {scanState === "processing" && (
              <>
                <h1 className="text-2xl font-bold">Validando...</h1>
                {processingHint && <p className="text-sm text-muted-foreground animate-in fade-in duration-300">Si no avanzó, usa el ingreso manual</p>}
              </>
            )}
            {scanState === "success" && result?.success && (
              <>
                <p className="text-sm uppercase tracking-widest font-semibold text-primary">Entregar</p>
                <h1 className="text-3xl font-black leading-tight">{delivery.name}</h1>
                <p className="text-6xl font-black text-primary leading-none">×{delivery.quantity}</p>
                {result.deliver?.source && <p className="text-sm text-muted-foreground">{getSourceLabel(result.deliver.source)}</p>}
                {result.deliver?.type === "menu_items" && result.deliver.items && result.deliver.items.length > 1 && (
                  <div className="bg-muted rounded-xl p-3 text-left space-y-2 mt-2">
                    {result.deliver.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.name}</span><span className="font-bold">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {scanState === "error" && (
              <>
                <h1 className="text-2xl font-black text-destructive">{getErrorTitle(result?.error_code)}</h1>
                {result?.message && <p className="text-sm text-muted-foreground leading-relaxed break-words">{result.message}</p>}
                <Button variant="outline" size="lg" onClick={e => { e.stopPropagation(); resumeScanning(); }} className="mt-2 gap-2 h-12 px-6">
                  <RefreshCw className="w-4 h-4" />Reintentar
                </Button>
              </>
            )}
            {scanState === "mixer_selection" && (
              <>
                <h1 className="text-xl font-semibold">Seleccionando mixer</h1>
                <p className="text-muted-foreground text-sm">Elige el tipo de mixer para continuar</p>
              </>
            )}
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full border text-sm font-medium ${badge.ring}`}>
            <span className={`w-2 h-2 rounded-full ${badge.dot} ${badge.pulse ? "animate-pulse" : ""}`} />
            {badge.label}
          </div>

          {/* History — only when idle */}
          {scanHistory.length > 0 && scanState === "idle" && (
            <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-2">
                <History className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Últimos canjes</span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {scanHistory.slice(0, 6).map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.status === "SUCCESS" ? <CheckCircle2 className="w-3 h-3 text-primary shrink-0" /> : e.status === "ALREADY_REDEEMED" ? <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" /> : <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                      <span className="truncate">{e.label}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0 ml-2">{format(e.time, "HH:mm", { locale: es })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* ── Footer: secondary controls ── */}
        <footer className="flex items-center justify-center gap-1 px-4 py-3 border-t border-border/50" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5 h-9" onClick={() => setShowManualEntry(true)}>
            <Keyboard className="w-3.5 h-3.5" />Ingreso manual
          </Button>
          {barLocations.length > 1 && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5 h-9" onClick={() => setShowBarSelection(true)}>
              <MapPin className="w-3.5 h-3.5" />Cambiar barra
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5 h-9" onClick={() => setShowWasteDialog(true)}>
            <Trash2 className="w-3.5 h-3.5" />Registrar merma
          </Button>
        </footer>

        {/* ── Debug overlay ── */}
        {debugMode && (
          <div className="fixed bottom-16 left-2 z-50 bg-card border rounded-lg p-3 text-xs font-mono space-y-1 shadow-xl">
            <div className="text-muted-foreground font-bold mb-1 text-[10px] uppercase tracking-wider">Debug</div>
            <div>state: <span className="text-yellow-400">{scanState}</span></div>
            <div>step: <span className="text-cyan-400">{debugStep}</span></div>
            <div>token: <span className="text-foreground">{lastParsedToken.slice(-10) || "—"}</span></div>
            <div>frozen: <span className="text-orange-400">{scannerFrozen ? "YES" : "no"}</span></div>
            <div>proc: <span className="text-red-400">{isProcessingRef.current ? "YES" : "no"}</span></div>
            <div>venue: <span className="text-primary">…{currentVenueId.slice(-8) || "?"}</span></div>
          </div>
        )}

        {/* ── Mixer dialog ── */}
        {scanState === "mixer_selection" && (
          <MixerSelectionDialog
            mixerSlots={mixerSlots}
            isLoading={isRedeemingWithMixer}
            onConfirm={handleMixerConfirm}
            onCancel={handleMixerCancel}
            cocktailName={pendingCocktailName}
          />
        )}

        {/* ── Manual entry dialog ── */}
        <Dialog open={showManualEntry} onOpenChange={open => { setShowManualEntry(open); if (!open) { setManualToken(""); setTimeout(focusInput, 200); } }}>
          <DialogContent className="max-w-sm" onClick={e => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Keyboard className="w-4 h-4" />Ingreso manual</DialogTitle>
              <DialogDescription>Ingresa el token o URL del código QR</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input placeholder="Pega o escribe el token o URL" value={manualToken} onChange={e => setManualToken(e.target.value)} onKeyDown={e => e.key === "Enter" && handleManualSubmit()} autoFocus className="h-12 text-base" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12" onClick={() => { setShowManualEntry(false); setManualToken(""); }}>Cancelar</Button>
                <Button className="flex-1 h-12" onClick={handleManualSubmit}>Canjear</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Waste dialog ── */}
        <WasteRegistrationDialog open={showWasteDialog} onOpenChange={setShowWasteDialog} onWasteRegistered={() => setShowWasteDialog(false)} />
      </div>
    </VenueGuard>
  );
}
