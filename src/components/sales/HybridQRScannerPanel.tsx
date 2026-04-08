import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown, CheckCircle2, XCircle, Loader2,
  Package, QrCode,
} from "lucide-react";
import { logAuditEvent } from "@/lib/monitoring";
import { parseQRToken } from "@/lib/qr";

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
  missing?: Array<{ product_name: string; required_qty: number; available_qty?: number; unit: string }>;
}

export interface HybridQRScannerPanelProps {
  barLocationId: string;
  barName: string;
  venueId: string;
}

const AUTO_RESET_MS = 6000;
const DEDUPE_MS = 5000;
const WATCHDOG_MS = 10000;

function errorLabel(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "ALREADY_REDEEMED":        return "Ya canjeado";
    case "TOKEN_EXPIRED":           return "QR vencido";
    case "PAYMENT_NOT_CONFIRMED":   return "Pago no confirmado";
    case "SALE_CANCELLED":          return "Venta cancelada";
    case "TOKEN_NOT_FOUND":         return "Código no encontrado";
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

export function HybridQRScannerPanel({ barLocationId, barName, venueId }: HybridQRScannerPanelProps) {
  const [open, setOpen] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<RedemptionResult | null>(null);

  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef("");
  const lastTokenRef = useRef("");
  const lastTimeRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    if (watchdogRef.current)   { clearTimeout(watchdogRef.current);   watchdogRef.current   = null; }
  }, []);

  const resetToIdle = useCallback((opts?: { clearDedup?: boolean }) => {
    clearTimers();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    processingRef.current = false;
    if (opts?.clearDedup) { lastTokenRef.current = ""; lastTimeRef.current = 0; }
    scanBufferRef.current = "";
    setScanState("idle");
    setResult(null);
    setTimeout(() => scannerInputRef.current?.focus(), 80);
  }, [clearTimers]);

  useEffect(() => {
    if (open && scanState === "idle") {
      const t = setTimeout(() => scannerInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open, scanState]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      if (scanState === "idle" && document.activeElement !== scannerInputRef.current) {
        scannerInputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [open, scanState]);

  const scheduleReset = useCallback(() => {
    clearTimers();
    resetTimerRef.current = setTimeout(() => resetToIdle({ clearDedup: false }), AUTO_RESET_MS);
  }, [clearTimers, resetToIdle]);

  const processCourtesy = useCallback(async (code: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setScanState("processing");
    setResult(null);

    watchdogRef.current = setTimeout(() => resetToIdle({ clearDedup: true }), WATCHDOG_MS);

    try {
      const { data: cq, error: cqErr } = await supabase
        .from("courtesy_qr")
        .select("id, product_name, qty, status, used_count, max_uses, expires_at")
        .eq("code", code)
        .eq("venue_id", venueId)
        .maybeSingle();
      if (cqErr) throw cqErr;
      clearTimers();

      if (!cq) {
        setResult({ success: false, error_code: "TOKEN_NOT_FOUND", message: "Cortesía no encontrada" });
        setScanState("error"); scheduleReset(); return;
      }
      if (cq.status !== "active") {
        setResult({ success: false, error_code: "ALREADY_REDEEMED", message: "Cortesía ya usada" });
        setScanState("error"); scheduleReset(); return;
      }
      if (new Date(cq.expires_at) < new Date()) {
        setResult({ success: false, error_code: "TOKEN_EXPIRED", message: "Cortesía vencida" });
        setScanState("error"); scheduleReset(); return;
      }
      if (cq.used_count >= cq.max_uses) {
        setResult({ success: false, error_code: "ALREADY_REDEEMED", message: "Sin usos disponibles" });
        setScanState("error"); scheduleReset(); return;
      }

      const newCount = cq.used_count + 1;
      const newStatus = newCount >= cq.max_uses ? "redeemed" : "active";
      await supabase.from("courtesy_qr").update({ used_count: newCount, status: newStatus }).eq("id", cq.id);

      const r: RedemptionResult = {
        success: true,
        deliver: { type: "menu_items", items: [{ name: cq.product_name, quantity: cq.qty }] },
      };
      setResult(r);
      setScanState("success");
      logAuditEvent({ action: "redeem_courtesy_hybrid", status: "success", metadata: { code: code.slice(0, 6), product: cq.product_name, bar_id: barLocationId, source: "hybrid_pos" } });
      scheduleReset();
    } catch (err: any) {
      clearTimers();
      setResult({ success: false, message: err?.message || "Error al canjear cortesía" });
      setScanState("error"); scheduleReset();
    } finally {
      processingRef.current = false;
    }
  }, [venueId, barLocationId, clearTimers, resetToIdle, scheduleReset]);

  const processToken = useCallback(async (token: string) => {
    if (processingRef.current) return;
    const now = Date.now();
    if (token === lastTokenRef.current && now - lastTimeRef.current < DEDUPE_MS) return;
    lastTokenRef.current = token;
    lastTimeRef.current = now;
    processingRef.current = true;
    setScanState("processing");
    setResult(null);

    watchdogRef.current = setTimeout(() => resetToIdle({ clearDedup: true }), WATCHDOG_MS);
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
      if (r.error_code === "TOO_FAST") {
        processingRef.current = false;
        setScanState("idle");
        return;
      }

      logAuditEvent({
        action: "redeem_pickup_token",
        status: r.success ? "success" : "fail",
        metadata: { token: token.slice(0, 8), error_code: r.error_code, bar_id: barLocationId, source: "hybrid_pos" },
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
        metadata: { token: token.slice(0, 8), error: err?.message, bar_id: barLocationId, source: "hybrid_pos" },
      });
      setResult({ success: false, message: err?.message || "Error inesperado" });
      setScanState("error");
      scheduleReset();
    } finally {
      processingRef.current = false;
      abortRef.current = null;
    }
  }, [barLocationId, clearTimers, resetToIdle, scheduleReset]);

  const handleScannerKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const raw = scanBufferRef.current.trim();
      scanBufferRef.current = "";
      if (scannerInputRef.current) scannerInputRef.current.value = "";
      if (!raw || scanState !== "idle") return;
      const parsed = parseQRToken(raw);
      if (!parsed.valid) return;
      if (parsed.type === 'courtesy') {
        processCourtesy(parsed.token);
      } else {
        processToken(parsed.token);
      }
    } else if (e.key.length === 1) {
      scanBufferRef.current += e.key;
    }
  }, [scanState, processToken, processCourtesy]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    resetToIdle({ clearDedup: true });
  }, [resetToIdle]);

  const summary = deliverSummary(result);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="shrink-0 border-t border-amber-500/30 bg-amber-500/5">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-amber-500/10 transition-colors">
        <div className="flex items-center gap-2">
          <QrCode className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[11px] font-semibold tracking-wide text-amber-700">
            Canjear QR
          </span>
          {scanState === "success" && (
            <Badge className="h-4 text-[9px] bg-green-600/20 text-green-700 border-green-600/30 px-1.5">OK</Badge>
          )}
          {scanState === "error" && (
            <Badge className="h-4 text-[9px] bg-destructive/20 text-destructive border-destructive/30 px-1.5">Error</Badge>
          )}
          {scanState === "processing" && (
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-amber-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-2">
          <input
            ref={scannerInputRef}
            className="fixed -left-[9999px] w-px h-px opacity-0 pointer-events-none"
            onKeyDown={handleScannerKeyDown}
            onChange={e => { scanBufferRef.current = e.target.value; }}
            onBlur={() => {
              setTimeout(() => {
                if (open && scanState === "idle" &&
                    (document.activeElement === document.body || document.activeElement === null)) {
                  scannerInputRef.current?.focus();
                }
              }, 200);
            }}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          {scanState === "idle" && (
            <div className="flex flex-col items-center gap-1 py-3">
              <QrCode className="w-8 h-8 text-amber-600/60 animate-pulse" />
              <p className="text-[10px] text-muted-foreground text-center">
                Escanea el QR con el lector · Barra: <span className="font-semibold text-foreground">{barName}</span>
              </p>
            </div>
          )}

          {scanState === "processing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="w-10 h-10 animate-spin text-amber-600" />
              <p className="text-sm text-amber-700 font-medium">Canjeando...</p>
            </div>
          )}

          {scanState === "success" && result && (
            <div className="rounded-lg bg-green-600/10 border border-green-600/20 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <span className="text-sm font-bold text-green-700">ENTREGAR</span>
              </div>
              {summary && (
                <div className="flex items-center gap-2 pl-7">
                  <Package className="w-4 h-4 text-green-600/70" />
                  <p className="text-sm text-green-800 font-medium">{summary}</p>
                </div>
              )}
            </div>
          )}

          {scanState === "error" && result && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive shrink-0" />
                <span className="text-sm font-semibold text-destructive">
                  {errorLabel(result.error_code, result.message)}
                </span>
              </div>
              {result.missing && result.missing.length > 0 && (
                <div className="pl-7 space-y-1">
                  {result.missing.map((m, i) => (
                    <p key={i} className="text-xs text-destructive/80">
                      {m.product_name}: {m.available_qty ?? 0}/{m.required_qty} {m.unit}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {(scanState === "success" || scanState === "error") && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-[10px] text-muted-foreground"
              onClick={handleDismiss}
            >
              Listo — siguiente
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
