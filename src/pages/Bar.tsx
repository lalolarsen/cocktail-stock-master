import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Loader2, LogOut, CheckCircle2, XCircle, AlertCircle, Keyboard,
  RefreshCw, MapPin, Package, Trash2, History, QrCode, Bluetooth, Users, X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import WorkerPinDialog from "@/components/WorkerPinDialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { logAuditEvent } from "@/lib/monitoring";
import { parseQRToken } from "@/lib/qr";
import { openBottlesTable, openBottleEventsTable } from "@/lib/db-tables";
import { VenueGuard } from "@/components/VenueGuard";
import { VenueIndicator } from "@/components/VenueIndicator";
import { WasteRegistrationDialog } from "@/components/dashboard/WasteRegistrationDialog";
import { useOpenBottles, type BottleCheckResult } from "@/hooks/useOpenBottles";
import { useAppSession } from "@/contexts/AppSessionContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type BarWorker = { id: string; full_name: string | null };

interface SaleItemWithIngredients {
  quantity: number;
  cocktail_id: string | null;
  cocktails: {
    cocktail_ingredients: Array<{
      quantity: number;
      products: { id: string; name: string; capacity_ml: number } | null;
    }>;
  } | null;
}

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
type ScanState = "idle" | "processing" | "success" | "error" | "delivered_by_selection";

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_HISTORY_ENTRIES = 20;
const DEDUPE_WINDOW_MS = 5000;
const AUTO_RESET_MS = 2500;
const WATCHDOG_MS = 10000;

// ── Helpers ────────────────────────────────────────────────────────────────────

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

  // Delivered-by gate
  const [pendingDeliveredBy, setPendingDeliveredBy] = useState<{ token: string; mixerOverrides: { slot_index: number; product_id: string }[] | null } | null>(null);

  // Bar selection
  const [barLocations, setBarLocations] = useState<BarLocation[]>([]);
  const [selectedBarId, setSelectedBarId] = useState("");
  const [showBarSelection, setShowBarSelection] = useState(true);

  // Bartender auditing
  const [barWorkers, setBarWorkers] = useState<BarWorker[]>([]);
  const [barWorkersLoading, setBarWorkersLoading] = useState(true);
  const [headBartender, setHeadBartender] = useState<BarWorker | null>(null);
  const [secondBartender, setSecondBartender] = useState<BarWorker | null>(null);
  const [showAddBartender, setShowAddBartender] = useState(false);
  const [addBartenderSelectedId, setAddBartenderSelectedId] = useState("");

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
  const debugTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef("");
  const lastTokenRef = useRef("");
  const lastTimeRef = useRef(0);
  const isProcessingRef = useRef(false);
  const redeemInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const checkBottlesRef = useRef<((t: string, o: { slot_index: number; product_id: string }[] | null) => Promise<void>) | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("stock_locations").select("*").eq("type", "bar").eq("is_active", true).order("name").then(({ data }) => {
      if (!data) return;
      setBarLocations(data);
      // Pre-select saved bar but always show the selection screen
      const saved = localStorage.getItem("bartenderBarId");
      if (saved && data.some((b: BarLocation) => b.id === saved)) {
        setSelectedBarId(saved);
      } else if (data.length === 1) {
        setSelectedBarId(data[0].id);
      }
    });
  }, []);

  // Load bar workers
  useEffect(() => {
    if (!currentVenueId) return;
    setBarWorkersLoading(true);
    supabase.rpc("list_bar_workers", { p_venue_id: currentVenueId }).then(({ data, error }) => {
      if (error) {
        console.error("[Bar] Error loading workers:", error);
        setBarWorkers([]);
      } else {
        setBarWorkers((data || []).map((w: any) => ({ id: w.id, full_name: w.full_name || "Sin nombre" })));
      }
      setBarWorkersLoading(false);
    });
  }, [currentVenueId]);

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

  // ── Confirm bar selection and auto-set head bartender ──────────────────────
  const confirmBarSelection = useCallback(() => {
    if (!selectedBarId) return;
    setShowBarSelection(false);
    // Auto-set the logged-in user as head bartender
    const found = barWorkers.find(w => w.id === currentUserId);
    const jefe: BarWorker = found ?? { id: currentUserId, full_name: userName || "Bartender" };
    setHeadBartender(jefe);
    setSecondBartender(null);
  }, [selectedBarId, barWorkers, currentUserId, userName]);

  // Also set head bartender when barWorkers loads after bar selection is already confirmed
  useEffect(() => {
    if (showBarSelection || !currentUserId || barWorkersLoading) return;
    if (headBartender) return; // already set
    const found = barWorkers.find(w => w.id === currentUserId);
    const jefe: BarWorker = found ?? { id: currentUserId, full_name: userName || "Bartender" };
    setHeadBartender(jefe);
  }, [barWorkers, barWorkersLoading, currentUserId, userName, showBarSelection, headBartender]);

  // ── Focus ──────────────────────────────────────────────────────────────────
  const focusInput = useCallback(() => {
    setTimeout(() => {
      if (!showManualEntry && !showBarSelection && !showWasteDialog && !showAddBartender) {
        scannerInputRef.current?.focus();
      }
    }, 80);
  }, [showManualEntry, showBarSelection, showWasteDialog, showAddBartender]);

  useEffect(() => {
    if (!showBarSelection && !showManualEntry && !showWasteDialog && !showAddBartender && scanState === "idle") focusInput();
  }, [showBarSelection, showManualEntry, showWasteDialog, showAddBartender, scanState, focusInput]);

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

  // ── Resolve delivered-by worker ──────────────────────────────────────────
  const getActiveBartenders = useCallback((): BarWorker[] => {
    const list: BarWorker[] = [];
    if (headBartender) list.push(headBartender);
    if (secondBartender) list.push(secondBartender);
    return list;
  }, [headBartender, secondBartender]);

  // ── Redeem token ───────────────────────────────────────────────────────────
  const redeemToken = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null,
    deliveredByWorkerId?: string | null,
  ): Promise<RedemptionResult | undefined> => {
    abortRef.current = new AbortController();
    setDebugStep("redeem");
    try {
      redeemInFlightRef.current = true;
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: selectedBarId || null,
        p_mixer_overrides: mixerOverrides || null,
        p_delivered_by_worker_id: deliveredByWorkerId || null,
      });
      if (abortRef.current?.signal.aborted) return undefined;
      if (error) throw error;
      const r = data as RedemptionResult;
      if (r.error_code === "TOO_FAST") { releaseLocks("idle"); setDebugStep("idle"); return undefined; }
      setDebugStep(r.success ? "done-success" : "done-error");
      setResult(r);
      logAuditEvent({ action: "redeem_pickup_token", status: r.success ? "success" : "fail", metadata: { token: token.slice(0, 8) + "...", error_code: r.error_code, bar_id: selectedBarId, delivered_by: deliveredByWorkerId } });
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

  // ── Resolve delivered-by then redeem ────────────────────────────────────────
  const resolveDeliveredByAndRedeem = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null,
    bottleChecks?: BottleCheckResult[],
  ) => {
    const bartenders = getActiveBartenders();
    if (bartenders.length <= 1) {
      // Auto-assign: single bartender or none
      const workerId = bartenders[0]?.id || null;
      if (bottleChecks?.length) {
        const r = await redeemToken(token, mixerOverrides, workerId);
        if (r?.success === true) {
          for (const c of bottleChecks) {
            if (c.required_ml <= 0) continue;
            try {
              await openBottlesHook.deductMl({ productId: c.product_id, mlToDeduct: c.required_ml, actorUserId: currentUserId, reason: `Canje QR ${token.slice(-6)}` });
            } catch (e: any) {
              console.error("[Bar] Bottle deduction non-blocking:", e);
              toast.warning("Canje OK, pero no se pudo registrar consumo de botella.");
            }
          }
        }
      } else {
        await redeemToken(token, mixerOverrides, workerId);
      }
    } else {
      // Multiple bartenders: show picker
      setPendingDeliveredBy({ token, mixerOverrides });
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      setScanState("delivered_by_selection");
    }
  }, [getActiveBartenders, redeemToken, openBottlesHook, currentUserId]);

  // ── Handle delivered-by selection ──────────────────────────────────────────
  const handleDeliveredBySelect = useCallback(async (workerId: string) => {
    if (!pendingDeliveredBy) return;
    const { token, mixerOverrides } = pendingDeliveredBy;
    setPendingDeliveredBy(null);
    setScanState("processing");
    await redeemToken(token, mixerOverrides, workerId);
  }, [pendingDeliveredBy, redeemToken]);

  const handleDeliveredByCancel = useCallback(() => {
    setPendingDeliveredBy(null);
    setDebugStep("idle"); releaseLocks("idle"); focusInput();
  }, [releaseLocks, focusInput]);

  // ── Check & auto-open bottles ──────────────────────────────────────────────
  const checkAndProceedWithBottles = useCallback(async (
    token: string,
    mixerOverrides: { slot_index: number; product_id: string }[] | null
  ) => {
    setDebugStep("bottle-check");
    try {
      if (!selectedBarId) { await resolveDeliveredByAndRedeem(token, mixerOverrides); return; }

      const { data: td, error: te } = await supabase.from("pickup_tokens").select("id, sale_id").eq("token", token).maybeSingle();
      if (te) throw te;
      if (!td?.sale_id) { await resolveDeliveredByAndRedeem(token, mixerOverrides); return; }

      const { data: si, error: se } = await supabase.from("sale_items")
        .select("quantity, cocktail_id, cocktails:cocktail_id(cocktail_ingredients(quantity, products:product_id(id, name, capacity_ml)))")
        .eq("sale_id", td.sale_id);
      if (se) throw se;

      const mlMap = new Map<string, { product_id: string; product_name: string; required_ml: number; capacity_ml: number }>();
      for (const item of ((si ?? []) as unknown as SaleItemWithIngredients[])) {
        const qty = item.quantity || 1;
        for (const ing of (item.cocktails?.cocktail_ingredients || [])) {
          const p = ing.products;
          if (!p?.capacity_ml || p.capacity_ml <= 0) continue;
          const ingQty = (ing.quantity || 0) * qty;
          if (ingQty <= 0) continue;
          const ex = mlMap.get(p.id);
          if (ex) ex.required_ml += ingQty;
          else mlMap.set(p.id, { product_id: p.id, product_name: p.name, required_ml: ingQty, capacity_ml: p.capacity_ml });
        }
      }

      if (mlMap.size === 0) { await resolveDeliveredByAndRedeem(token, mixerOverrides); return; }

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
            const { data: nb, error: ie } = await openBottlesTable().insert({
              venue_id: currentVenueId, location_id: selectedBarId, product_id: check.product_id,
              status: "OPEN", opened_by_user_id: currentUserId,
              initial_ml: capacity_ml, remaining_ml: capacity_ml,
              notes: `Auto-abierta por canje ${token.slice(-6)}`,
            }).select().single();
            if (ie) throw ie;
            await openBottleEventsTable().insert({
              open_bottle_id: (nb as unknown as { id: string }).id,
              event_type: "OPENED", delta_ml: capacity_ml,
              before_ml: 0, after_ml: capacity_ml, actor_user_id: currentUserId, reason: "Auto-open por canje",
            });
          }
        }
        await openBottlesHook.fetchBottles();
      }

      setDebugStep("redeem");
      const forDeduction: BottleCheckResult[] = ingredients.map(i => ({ product_id: i.product_id, product_name: i.product_name, required_ml: i.required_ml, available_ml: i.required_ml, sufficient: true, open_bottles: [] }));
      await resolveDeliveredByAndRedeem(token, mixerOverrides, forDeduction);
    } catch (err: any) {
      const msg = err?.message || "Error al verificar botellas";
      console.error("[Bar][bottles]", err);
      logAuditEvent({ action: "auto_open_bottles_failed", status: "fail", metadata: { token: token.slice(-6), bar_id: selectedBarId, error: msg } });
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: msg });
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "ERROR", label: "ERROR: " + msg.slice(0, 40), tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error"); scheduleAutoReset();
    }
  }, [openBottlesHook, resolveDeliveredByAndRedeem, selectedBarId, currentVenueId, currentUserId, releaseLocks, scheduleAutoReset]);

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

      // Direct redeem — with delivered-by gate
      if (selectedBarId) {
        await checkBottlesRef.current?.(token, null);
      } else {
        await resolveDeliveredByAndRedeem(token, null);
      }
    } catch (err: any) {
      if (abortRef.current?.signal.aborted) return;
      const msg = err?.message || "Error al procesar el código";
      setDebugStep("done-error");
      setResult({ success: false, error_code: "SYSTEM_ERROR", message: msg });
      const entry: ScanHistoryEntry = { id: crypto.randomUUID(), time: new Date(), status: "ERROR", label: "ERROR: " + msg.slice(0, 40), tokenShort: token.slice(-6) };
      setScanHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      releaseLocks("error"); scheduleAutoReset();
    }
  }, [selectedBarId, scannerFrozen, redeemToken, resolveDeliveredByAndRedeem, releaseLocks, scheduleAutoReset]);

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
  const availableSecondBartenders = barWorkers.filter(w => w.id !== headBartender?.id);

  // ── Render: PIN ────────────────────────────────────────────────────────────
  if (showPinDialog) {
    return <WorkerPinDialog open={showPinDialog} onVerified={() => { setShowPinDialog(false); setIsVerified(true); }} onCancel={() => navigate("/")} />;
  }

  // ── Render: Configurar Barra ───────────────────────────────────────────────
  if (showBarSelection) {
    return (
      <VenueGuard>
        <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
          <div className="max-w-lg mx-auto space-y-6 pt-12">
            <div className="text-center space-y-2">
              <MapPin className="w-16 h-16 mx-auto text-primary" />
              <h1 className="text-3xl font-bold">Configurar Barra</h1>
              <p className="text-muted-foreground">Selecciona tu barra</p>
            </div>

            <Card className="p-6 space-y-6">
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-lg font-medium">
                  <MapPin className="w-5 h-5" />
                  Barra
                </p>
                {barLocations.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                    No hay barras disponibles. Contacta al administrador.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {barLocations.map((bar) => (
                      <Card
                        key={bar.id}
                        onClick={() => setSelectedBarId(bar.id)}
                        className={`p-4 cursor-pointer transition-all hover:scale-105 ${
                          selectedBarId === bar.id
                            ? "border-primary bg-primary/10 ring-2 ring-primary"
                            : "hover:border-primary/50"
                        }`}
                      >
                        <div className="text-center">
                          <MapPin className={`w-8 h-8 mx-auto mb-2 ${selectedBarId === bar.id ? "text-primary" : "text-muted-foreground"}`} />
                          <p className="font-semibold">{bar.name}</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={confirmBarSelection}
                disabled={!selectedBarId}
                className="w-full"
                size="lg"
              >
                Comenzar
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
      </VenueGuard>
    );
  }

  // ── Status badge config ────────────────────────────────────────────────────
  const badgeCfg: Record<ScanState, { ring: string; dot: string; label: string; pulse: boolean }> = {
    idle:                    { ring: "border-primary/30 text-primary bg-primary/5",         dot: "bg-primary",     label: "Bluetooth activo",     pulse: true  },
    processing:              { ring: "border-yellow-500/40 text-yellow-400 bg-yellow-500/5", dot: "bg-yellow-400",  label: "Validando...",          pulse: true  },
    
    delivered_by_selection:  { ring: "border-amber-400/40 text-amber-400 bg-amber-500/5",    dot: "bg-amber-400",   label: "¿Quién entrega?",       pulse: false },
    success:                 { ring: "border-primary/40 text-primary bg-primary/10",         dot: "bg-primary",     label: "Canje exitoso",         pulse: false },
    error:                   { ring: "border-destructive/40 text-destructive bg-destructive/5", dot: "bg-destructive", label: getErrorTitle(result?.error_code), pulse: false },
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
            {barName && (
              <button
                className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium hover:bg-primary/20 transition-colors"
                onClick={() => setShowBarSelection(true)}
              >
                {barName}
                <span className="text-[10px] opacity-60 ml-0.5">cambiar</span>
              </button>
            )}
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
            
            {scanState === "delivered_by_selection" && <Users className="w-28 h-28 text-amber-500" />}
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
            {scanState === "delivered_by_selection" && (
              <>
                <h1 className="text-2xl font-bold">¿Quién entrega?</h1>
                <p className="text-muted-foreground text-sm">Selecciona el bartender que entrega</p>
                <div className="flex flex-col gap-3 mt-4 w-full">
                  {getActiveBartenders().map(w => (
                    <Button
                      key={w.id}
                      size="lg"
                      className="h-16 text-lg font-semibold gap-3"
                      onClick={e => { e.stopPropagation(); handleDeliveredBySelect(w.id); }}
                    >
                      <Users className="w-5 h-5" />
                      {w.full_name || "Bartender"}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground mt-2"
                    onClick={e => { e.stopPropagation(); handleDeliveredByCancel(); }}
                  >
                    Cancelar
                  </Button>
                </div>
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
        <footer className="flex items-center justify-center gap-1 px-4 py-3 border-t border-border/50 flex-wrap" onClick={e => e.stopPropagation()}>
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

          {/* Second bartender control */}
          {secondBartender ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium h-9">
              <Users className="w-3.5 h-3.5" />
              <span>{secondBartender.full_name || "Bartender"}</span>
              <button
                className="ml-1 hover:text-destructive transition-colors"
                onClick={() => { setSecondBartender(null); focusInput(); }}
                aria-label="Quitar segundo bartender"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5 h-9"
              onClick={() => { setAddBartenderSelectedId(""); setShowAddBartender(true); }}
              disabled={availableSecondBartenders.length === 0}
            >
              <Users className="w-3.5 h-3.5" />+ Agregar Bartender
            </Button>
          )}
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
            locationId={selectedBarId}
            venueId={currentVenueId}
            isLoading={isRedeemingWithMixer}
            onConfirm={handleMixerConfirm}
            onCancel={handleMixerCancel}
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

        {/* ── Add second bartender dialog ── */}
        <Dialog open={showAddBartender} onOpenChange={open => { setShowAddBartender(open); if (!open) { setAddBartenderSelectedId(""); setTimeout(focusInput, 200); } }}>
          <DialogContent className="max-w-sm" onClick={e => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" />Agregar Bartender</DialogTitle>
              <DialogDescription>Selecciona el segundo bartender en turno</DialogDescription>
            </DialogHeader>
            <RadioGroup value={addBartenderSelectedId} onValueChange={setAddBartenderSelectedId} className="space-y-2 py-2">
              {availableSecondBartenders.map(w => (
                <label key={w.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50">
                  <RadioGroupItem value={w.id} />
                  <span className="text-sm font-medium">{w.full_name || "Sin nombre"}</span>
                </label>
              ))}
            </RadioGroup>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddBartender(false); setAddBartenderSelectedId(""); }}>Cancelar</Button>
              <Button
                disabled={!addBartenderSelectedId}
                onClick={() => {
                  const selected = availableSecondBartenders.find(w => w.id === addBartenderSelectedId);
                  if (selected) setSecondBartender(selected);
                  setShowAddBartender(false);
                  setAddBartenderSelectedId("");
                  focusInput();
                }}
              >
                Agregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </VenueGuard>
  );
}
