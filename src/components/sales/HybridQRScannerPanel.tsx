import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  QrCode, ChevronDown, CheckCircle2, XCircle, Loader2,
  Package, Scan, Keyboard,
} from "lucide-react";
import { parseQRToken } from "@/lib/qr";
import { logAuditEvent } from "@/lib/monitoring";

// ── Types ────────────────────────────────────────────────────────────────────
type ScanState = "idle" | "processing" | "success" | "error";

interface DeliverItem { name: string; quantity: number }
interface RedemptionResult {
  success: boolean;
  error_code?: string;
  message?: string;
  deliver?: {
    type: "cover" | "menu_items";
    name?: string;
    quantity?: number;
    items?: DeliverItem[];
  };
  // RPC returns `missing` (confirmed from migration SQL)
  missing?: Array<{ product_name: string; required_qty: number; available_qty?: number; unit: string }>;
}

export interface HybridQRScannerPanelProps {
  /** Bar location ID configured in the hybrid POS terminal */
  barLocationId: string;
  barName: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const AUTO_RESET_MS = 3500;
const DEDUPE_MS = 5000;
const WATCHDOG_MS = 10000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function errorLabel(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "ALREADY_REDEEMED":        return "Ya canjeado";
    case "TOKEN_EXPIRED":           return "QR vencido";
    case "PAYMENT_NOT_CONFIRMED":   return "Pago no confirmado";
    case "SALE_CANCELLED":          return "Venta cancelada";
    case "TOKEN_NOT_FOUND":         return "QR no encontrado";
    case "INSUFFICIENT_BAR_STOCK":  return "Sin stock en barra";
    default:                        return fallback || "Error al canjear";
  }
}

function deliverSummary(result: RedemptionResult | null): string {
  if (!result?.deliver) return "";
  const d = result.deliver;
  if (d.type === "cover" && d.name) return `${d.name} x${d.quantity ?? 1}`;
  if (d.type === "menu_items" && d.items?.length)
    return d.items.map(i => `${i.name} x${i.quantity}`).join(", ");
  return "";
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HybridQRScannerPanel({ barLocationId, barName }: HybridQRScannerPanelProps) {
  const [open, setOpen] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState("");

  // USB scanner: hidden input + keyboard buffer (mirrors Bar.tsx pattern)
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef("");
  const lastTokenRef = useRef("");
  const lastTimeRef = useRef(0);

  // Timers & abort
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);

  // ── Internal helpers ──────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    if (watchdogRef.current)   { clearTimeout(watchdogRef.current);   watchdogRef.current   = null; }
  }, []);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const resetToIdle = useCallback((opts?: { clearDedup?: boolean }) => {
    clearTimers();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    processingRef.current = false;
    if (opts?.clearDedup) { lastTokenRef.current = ""; lastTimeRef.current = 0; }
    bufferRef.current = "";
    if (inputRef.current) inputRef.current.value = "";
    setScanState("idle");
    setResult(null);
  }, [clearTimers]);

  // ── Lifecycle: unmount cleanup ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimers();
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    };
  }, [clearTimers]);

  // ── Lifecycle: open/close cleanup ─────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      // Abort in-flight request, clear timers, clear partial buffer
      resetToIdle();
    } else {
      focusInput();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lifecycle: focus when idle + open ────────────────────────────────────
  useEffect(() => {
    if (open && scanState === "idle") focusInput();
  }, [open, scanState, focusInput]);

  // ── scheduleReset ─────────────────────────────────────────────────────────
  const scheduleReset = useCallback(() => {
    clearTimers();
    resetTimerRef.current = setTimeout(() => {
      resetToIdle({ clearDedup: false });
      if (open) focusInput();
    }, AUTO_RESET_MS);
  }, [clearTimers, resetToIdle, open, focusInput]);

  // ── processToken ──────────────────────────────────────────────────────────
  const processToken = useCallback(async (token: string) => {
    if (processingRef.current) return;

    // Deduplicate rapid double-scans of same token
    const now = Date.now();
    if (token === lastTokenRef.current && now - lastTimeRef.current < DEDUPE_MS) return;
    lastTokenRef.current = token;
    lastTimeRef.current = now;

    processingRef.current = true;
    setScanState("processing");
    setResult(null);

    // Watchdog: force-reset if RPC hangs beyond WATCHDOG_MS
    watchdogRef.current = setTimeout(() => {
      resetToIdle({ clearDedup: true });
      if (open) focusInput();
    }, WATCHDOG_MS);

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: barLocationId,
        p_mixer_overrides: null,
        p_delivered_by_worker_id: null,
      });

      if (signal.aborted) return;
      clearTimers();

      if (error) throw error;

      const r = data as unknown as RedemptionResult;

      // Silently swallow TOO_FAST (server-side dedupe)
      if (r.error_code === "TOO_FAST") {
        processingRef.current = false;
        setScanState("idle");
        return;
      }

      logAuditEvent({
        action: "redeem_pickup_token",
        status: r.success ? "success" : "fail",
        metadata: {
          token: token.slice(0, 8) + "...",
          error_code: r.error_code,
          bar_id: barLocationId,
          source: "hybrid_pos_scanner",
        },
      });

      setResult(r);
      setScanState(r.success ? "success" : "error");
      scheduleReset();
    } catch (err: any) {
      if (signal.aborted) return;
      clearTimers();
      logAuditEvent({
        action: "redeem_pickup_token",
        status: "fail",
        metadata: { token: token.slice(0, 8) + "...", error: err?.message, bar_id: barLocationId, source: "hybrid_pos_scanner" },
      });
      setResult({ success: false, message: err?.message || "Error inesperado" });
      setScanState("error");
      scheduleReset();
    } finally {
      processingRef.current = false;
      abortRef.current = null;
    }
  }, [barLocationId, clearTimers, resetToIdle, scheduleReset, open, focusInput]);

  // ── Keyboard handler (USB scanner: buffer chars → dispatch on Enter) ──────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const raw = bufferRef.current.trim();
      bufferRef.current = "";
      if (inputRef.current) inputRef.current.value = "";
      if (!raw || scanState !== "idle") return;
      const parsed = parseQRToken(raw);
      if (parsed.valid) processToken(parsed.token);
    } else {
      bufferRef.current += e.key;
    }
  }, [scanState, processToken]);

  // ── onBlur: re-focus input if nothing meaningful stole focus ─────────────
  const handleBlur = useCallback(() => {
    if (!open) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (active === document.body || active === null) {
        inputRef.current?.focus();
      }
    }, 200);
  }, [open]);

  // ── Manual dismiss ────────────────────────────────────────────────────────
  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    resetToIdle({ clearDedup: true });
    focusInput();
  }, [resetToIdle, focusInput]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const summary = deliverSummary(result);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="shrink-0 border-t border-amber-500/30 bg-amber-500/5">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-amber-500/10 transition-colors">
        <div className="flex items-center gap-2">
          <QrCode className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[11px] font-semibold tracking-wide text-amber-700">
            Escáner QR
          </span>
          {scanState === "success" && (
            <Badge className="h-4 text-[9px] bg-green-600/20 text-green-700 border-green-600/30 px-1.5">
              OK
            </Badge>
          )}
          {scanState === "error" && (
            <Badge className="h-4 text-[9px] bg-destructive/20 text-destructive border-destructive/30 px-1.5">
              Error
            </Badge>
          )}
          {scanState === "processing" && (
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-amber-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* Hidden input — captures USB scanner keystrokes (mirrors Bar.tsx pattern) */}
        <input
          ref={inputRef}
          className="fixed -left-[9999px] w-px h-px opacity-0 pointer-events-none"
          onKeyDown={handleKeyDown}
          onChange={e => { bufferRef.current = e.target.value; }}
          onBlur={handleBlur}
          autoComplete="off"
          inputMode="none"
          aria-hidden="true"
          tabIndex={open ? 0 : -1}
        />

        <div
          className="px-3 pb-3 space-y-2"
          onClick={() => { if (scanState === "idle") inputRef.current?.focus(); }}
        >
          {/* ── Idle ── */}
          {scanState === "idle" && (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-400/40 py-4 cursor-default select-none">
              <Scan className="w-6 h-6 text-amber-500/60" />
              <p className="text-[11px] text-amber-700/70 font-medium">
                Escanea un QR con el lector USB
              </p>
              <p className="text-[10px] text-muted-foreground">
                Descuenta desde: <span className="font-semibold text-foreground">{barName}</span>
              </p>
            </div>
          )}

          {/* ── Processing ── */}
          {scanState === "processing" && (
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
              <p className="text-[11px] text-amber-700 font-medium">Canjeando...</p>
            </div>
          )}

          {/* ── Success ── */}
          {scanState === "success" && result && (
            <div className="rounded-lg bg-green-600/10 border border-green-600/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-xs font-bold text-green-700">ENTREGAR</span>
              </div>
              {summary && (
                <div className="flex items-center gap-1.5 pl-5">
                  <Package className="w-3 h-3 text-green-600/70" />
                  <p className="text-[11px] text-green-800 font-medium">{summary}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {scanState === "error" && result && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
                <span className="text-xs font-semibold text-destructive">
                  {errorLabel(result.error_code, result.message)}
                </span>
              </div>
              {result.missing && result.missing.length > 0 && (
                <div className="pl-5 space-y-0.5">
                  {result.missing.map((m, i) => (
                    <p key={i} className="text-[10px] text-destructive/80">
                      {m.product_name}: {m.available_qty ?? 0}/{m.required_qty} {m.unit}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Dismiss button ── */}
          {(scanState === "success" || scanState === "error") && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-[10px] text-muted-foreground"
              onClick={handleDismiss}
            >
              Listo — seguir escaneando
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
