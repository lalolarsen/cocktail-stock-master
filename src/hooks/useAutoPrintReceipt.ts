/**
 * useAutoPrintReceipt – auto-print a receipt via print-js (browser print dialog).
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPreferredPaperWidthStorageKey, printRaw, printSaleDocuments, type PaperWidth, type ReceiptData } from "@/lib/printing/qz";
import { isAndroid } from "@/lib/printing/rawbt";
import { showManualFallback, clearManualFallback } from "@/lib/printing/print-tracker";

interface UseAutoPrintReceiptOptions {
  venueId: string | undefined;
  posId: string;
  userId: string;
  printerName: string;
  autoPrintEnabled: boolean;
}
interface PrintResult { success: boolean; error?: string; jobId?: string; }

export function useAutoPrintReceipt({ venueId, posId, printerName }: UseAutoPrintReceiptOptions) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastPrintStatus, setLastPrintStatus] = useState<"idle" | "success" | "failed">("idle");
  const lastData = useRef<{ data: ReceiptData; saleId?: string } | null>(null);
  const inFlight = useRef(new Map<string, Promise<PrintResult>>());

  const audit = useCallback(async (data: ReceiptData, saleId: string | undefined, result: PrintResult) => {
    try {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user.id;
      if (!uid || !venueId) return;
      const { error } = await supabase.from("print_jobs").insert({
        venue_id: venueId, pos_id: posId || null, sale_id: saleId || null, user_id: uid,
        job_type: "receipt_qr", print_status: result.success ? (isAndroid() ? "sent" : "browser") : "not_sent",
        printer_name: isAndroid() ? "rawbt" : printerName || "browser", payload: data as any,
        attempts: 1, error_message: result.error || null,
        printed_at: result.success ? new Date().toISOString() : null,
      });
      if (error) console.warn("[AutoPrint] audit failed", error.message);
    } catch (error) { console.warn("[AutoPrint] audit failed", error); }
  }, [venueId, posId, printerName]);

  const runPrint = useCallback((data: ReceiptData, saleId?: string, receiptOnly = false): Promise<PrintResult> => {
    const key = `${saleId || data.saleNumber}:${receiptOnly}`;
    const existing = inFlight.current.get(key);
    if (existing) return existing;
    if (!venueId) return Promise.resolve({ success: false, error: "Caja no configurada" });
    lastData.current = { data, saleId };
    const label = `Venta ${data.saleNumber}${receiptOnly ? " · comprobante" : " · cover y comprobante"}`;
    const paperWidth = localStorage.getItem(getPreferredPaperWidthStorageKey(venueId, posId)) === "58mm" ? "58mm" : "80mm";
    setIsPrinting(true); setLastPrintStatus("idle");
    // No network waits before RawBT: Chrome needs a recent user gesture.
    const work = (async (): Promise<PrintResult> => {
      let result: PrintResult;
      try {
        result = await (receiptOnly ? printRaw(printerName, data, paperWidth) : printSaleDocuments(printerName, data, paperWidth));
      } catch (error) { result = { success: false, error: error instanceof Error ? error.message : "Error de impresión" }; }
      if (result.success) clearManualFallback(label);
      else showManualFallback(label, async () => { await runPrint(data, saleId, receiptOnly); });
      void audit(data, saleId, result);
      setLastPrintStatus(result.success ? "success" : "failed");
      return result;
    })().finally(() => {
      inFlight.current.delete(key);
      setIsPrinting(inFlight.current.size > 0);
    });
    inFlight.current.set(key, work);
    return work;
  }, [venueId, posId, printerName, audit]);

  const autoPrintReceipt = useCallback((data: ReceiptData, saleId?: string, _pickupTokenId?: string, _isHybrid?: boolean) => runPrint(data, saleId), [runPrint]);
  const reprintLast = useCallback(() => {
    const last = lastData.current;
    return last ? runPrint(last.data, last.saleId, true) : Promise.resolve({ success: false, error: "No hay impresión previa" });
  }, [runPrint]);
  return { isPrinting, lastPrintStatus, qzAvailable: true, checkQzStatus: async () => true, autoPrintReceipt, reprintLast,
    fallbackPrint: (data: ReceiptData) => { void runPrint(data); },
  };
}
