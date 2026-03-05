import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QrCode, ChevronDown, CheckCircle2, XCircle, Loader2,
  Package, Scan,
} from "lucide-react";

// ── Helpers shared with Bar.tsx ──────────────────────────────────────────────
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
  if (token.length >= 12 && token.length <= 64 && /^[a-f0-9]+$/.test(token))
    return { valid: true, token };
  return { valid: false, token: "" };
}

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

interface HybridQRScannerPanelProps {
  /** Bar location ID configured in the hybrid POS */
  barLocationId: string;
  barName: string;
}

const AUTO_RESET_MS = 3500;
const DEDUPE_MS = 5000;

export function HybridQRScannerPanel({ barLocationId, barName }: HybridQRScannerPanelProps) {
  const [open, setOpen] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<RedemptionResult | null>(null);

  // USB scanner: hidden input + keyboard buffer
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef("");
  const lastTokenRef = useRef("");
  const lastTimeRef = useRef(0);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingRef = useRef(false);

  // Focus the hidden input when panel opens and is idle
  useEffect(() => {
    if (open && scanState === "idle") {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, scanState]);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      processingRef.current = false;
      setScanState("idle");
      setResult(null);
      bufferRef.current = "";
      if (inputRef.current) inputRef.current.value = "";
      setTimeout(() => inputRef.current?.focus(), 80);
    }, AUTO_RESET_MS);
  }, []);

  const processToken = useCallback(async (raw: string) => {
    if (processingRef.current) return;
    const { valid, token } = parseQRToken(raw);
    if (!valid) return;

    // Deduplicate rapid double-scans of same token
    const now = Date.now();
    if (token === lastTokenRef.current && now - lastTimeRef.current < DEDUPE_MS) return;
    lastTokenRef.current = token;
    lastTimeRef.current = now;

    processingRef.current = true;
    setScanState("processing");
    setResult(null);

    try {
      const { data, error } = await supabase.rpc("redeem_pickup_token", {
        p_token: token,
        p_bartender_bar_id: barLocationId || null,
        p_mixer_overrides: null,
        p_delivered_by_worker_id: null,
      });

      if (error) throw error;

      const r = data as RedemptionResult;

      // Silently swallow TOO_FAST
      if ((r as any).error_code === "TOO_FAST") {
        processingRef.current = false;
        setScanState("idle");
        return;
      }

      setResult(r);
      setScanState(r.success ? "success" : "error");
      scheduleReset();
    } catch (err: any) {
      setResult({ success: false, message: err?.message || "Error inesperado" });
      setScanState("error");
      scheduleReset();
    }
  }, [barLocationId, scheduleReset]);

  // Keyboard handler: buffer chars, trigger on Enter/newline (USB scanner behaviour)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const raw = bufferRef.current;
      bufferRef.current = "";
      if (inputRef.current) inputRef.current.value = "";
      if (raw.trim()) processToken(raw.trim());
    } else if (e.key.length === 1) {
      bufferRef.current += e.key;
    }
  }, [processToken]);

  // Click anywhere on the panel to re-focus the hidden input
  const handlePanelClick = useCallback(() => {
    if (open && scanState === "idle") inputRef.current?.focus();
  }, [open, scanState]);

  // ── Derived display ──
  const deliverSummary = (): string => {
    if (!result?.deliver) return "";
    const d = result.deliver;
    if (d.type === "cover" && d.name) return `${d.name} x${d.quantity ?? 1}`;
    if (d.type === "menu_items" && d.items?.length) {
      return d.items.map(i => `${i.name} x${i.quantity}`).join(", ");
    }
    return "";
  };

  const errorLabel = (code?: string) => {
    switch (code) {
      case "ALREADY_REDEEMED": return "Ya canjeado";
      case "TOKEN_EXPIRED": return "QR vencido";
      case "PAYMENT_NOT_CONFIRMED": return "Pago no confirmado";
      case "SALE_CANCELLED": return "Venta cancelada";
      case "TOKEN_NOT_FOUND": return "QR no encontrado";
      case "INSUFFICIENT_BAR_STOCK": return "Sin stock en barra";
      default: return result?.message || "Error al canjear";
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="shrink-0 border-t border-amber-500/30 bg-amber-500/5">
      <CollapsibleTrigger
        className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-amber-500/10 transition-colors"
        onClick={handlePanelClick}
      >
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
        {/* Hidden input — captures USB scanner keystrokes */}
        <input
          ref={inputRef}
          className="sr-only"
          readOnly
          aria-hidden="true"
          onKeyDown={handleKeyDown}
          tabIndex={open ? 0 : -1}
        />

        <div className="px-3 pb-3 space-y-2" onClick={handlePanelClick}>
          {/* Status area */}
          {scanState === "idle" && (
            <div
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-400/40 py-4 cursor-default select-none"
            >
              <Scan className="w-6 h-6 text-amber-500/60" />
              <p className="text-[11px] text-amber-700/70 font-medium">
                Escanea un QR con el lector USB
              </p>
              <p className="text-[10px] text-muted-foreground">
                Descuenta desde: <span className="font-semibold text-foreground">{barName}</span>
              </p>
            </div>
          )}

          {scanState === "processing" && (
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
              <p className="text-[11px] text-amber-700 font-medium">Canjeando...</p>
            </div>
          )}

          {scanState === "success" && result && (
            <div className="rounded-lg bg-green-600/10 border border-green-600/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-xs font-bold text-green-700">ENTREGAR</span>
              </div>
              {deliverSummary() && (
                <div className="flex items-center gap-1.5 pl-5">
                  <Package className="w-3 h-3 text-green-600/70" />
                  <p className="text-[11px] text-green-800 font-medium">{deliverSummary()}</p>
                </div>
              )}
            </div>
          )}

          {scanState === "error" && result && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
                <span className="text-xs font-semibold text-destructive">{errorLabel(result.error_code)}</span>
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

          {/* Manual dismiss button during error/success */}
          {(scanState === "success" || scanState === "error") && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-[10px] text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
                processingRef.current = false;
                setScanState("idle");
                setResult(null);
                bufferRef.current = "";
                setTimeout(() => inputRef.current?.focus(), 80);
              }}
            >
              Listo — seguir escaneando
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
