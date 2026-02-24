/**
 * useAutoPrintReceipt – auto-print a receipt+QR for a sale via QZ Tray.
 *
 * Fallback de navegador deshabilitado: la impresión sale solo por QZ.
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPreferredPaperWidthStorageKey,
  getPreferredPrinterStorageKey,
  isQZConnected,
  printRaw,
  type PaperWidth,
  type ReceiptData,
} from "@/lib/printing/qz";

interface UseAutoPrintReceiptOptions {
  venueId: string | undefined;
  posId: string;
  userId: string;
  printerName: string;
  autoPrintEnabled: boolean;
}

interface PrintResult {
  success: boolean;
  error?: string;
  jobId?: string;
}

export function useAutoPrintReceipt({
  venueId,
  posId,
  userId,
  printerName,
  autoPrintEnabled,
}: UseAutoPrintReceiptOptions) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastPrintStatus, setLastPrintStatus] = useState<"idle" | "success" | "failed">("idle");
  const [qzAvailable, setQzAvailable] = useState<boolean | null>(null);
  const lastJobIdRef = useRef<string | null>(null);

  /** Check QZ Tray connection status */
  const checkQzStatus = useCallback(async () => {
    const connected = await isQZConnected();
    setQzAvailable(connected);
    return connected;
  }, []);

  /**
   * Auto-print a receipt for a sale.
   * Creates a print_jobs audit row, attempts print (with 1 retry), updates status.
   */
  const autoPrintReceipt = useCallback(
    async (
      data: ReceiptData,
      saleId?: string,
      pickupTokenId?: string,
    ): Promise<PrintResult> => {
      const preferredPrinterKey = getPreferredPrinterStorageKey(venueId, posId);
      const effectivePrinter =
        printerName ||
        localStorage.getItem(preferredPrinterKey) ||
        localStorage.getItem("stockia_printer_name") ||
        "";
      const preferredPaperWidth =
        (localStorage.getItem(getPreferredPaperWidthStorageKey(venueId, posId)) as PaperWidth | null) ||
        "80mm";

      if (!venueId || !effectivePrinter) {
        return { success: false, error: "Impresión automática no configurada" };
      }

      setIsPrinting(true);
      setLastPrintStatus("idle");

      // Audit row
      const { data: job } = await supabase
        .from("print_jobs")
        .insert({
          venue_id: venueId,
          pos_id: posId || null,
          sale_id: saleId || null,
          pickup_token_id: pickupTokenId || null,
          user_id: userId,
          job_type: "receipt_qr",
          print_status: "pending",
          printer_name: effectivePrinter,
          payload: data as any,
          attempts: 0,
        })
        .select("id")
        .single();

      const jobId = job?.id;
      if (jobId) lastJobIdRef.current = jobId;

      // Attempt 1
      let result = await printRaw(effectivePrinter, data, preferredPaperWidth);

      // Retry once
      if (!result.success) {
        console.warn("[AutoPrint] Attempt 1 failed, retrying…", result.error);
        await new Promise((r) => setTimeout(r, 1000));
        result = await printRaw(effectivePrinter, data, preferredPaperWidth);
      }

      // Update audit
      if (jobId) {
        await supabase
          .from("print_jobs")
          .update({
            print_status: result.success ? "success" : "failed",
            error_message: result.error || null,
            attempts: result.success ? 1 : 2,
            printed_at: result.success ? new Date().toISOString() : null,
          })
          .eq("id", jobId);
      }

      setIsPrinting(false);
      setLastPrintStatus(result.success ? "success" : "failed");

      return { success: result.success, error: result.error, jobId };
    },
    [venueId, posId, userId, printerName, autoPrintEnabled],
  );

  /** Reprint the last job from audit */
  const reprintLast = useCallback(async (): Promise<PrintResult> => {
    if (!lastJobIdRef.current) {
      return { success: false, error: "No hay trabajo de impresión previo" };
    }

    const { data: job } = await supabase
      .from("print_jobs")
      .select("payload, printer_name")
      .eq("id", lastJobIdRef.current)
      .single();

    if (!job?.payload) {
      return { success: false, error: "No se encontró el trabajo de impresión" };
    }

    setIsPrinting(true);
    const preferredPaperWidth =
      (localStorage.getItem(getPreferredPaperWidthStorageKey(venueId, posId)) as PaperWidth | null) ||
      "80mm";

    const result = await printRaw(
      job.printer_name || printerName,
      job.payload as unknown as ReceiptData,
      preferredPaperWidth,
    );

    await supabase
      .from("print_jobs")
      .update({
        print_status: result.success ? "success" : "failed",
        error_message: result.error || null,
        attempts: 3,
        printed_at: result.success ? new Date().toISOString() : null,
      })
      .eq("id", lastJobIdRef.current);

    setIsPrinting(false);
    setLastPrintStatus(result.success ? "success" : "failed");

    return { success: result.success, error: result.error };
  }, [printerName, posId, venueId]);

  /**
   * Fallback deshabilitado: la impresión debe salir siempre por QZ Tray.
   */
  const fallbackPrint = useCallback((_data: ReceiptData) => {
    console.error("[AutoPrint] Fallback print está deshabilitado. Usa QZ Tray.");
    setLastPrintStatus("failed");
  }, []);

  return {
    isPrinting,
    lastPrintStatus,
    qzAvailable,
    checkQzStatus,
    autoPrintReceipt,
    reprintLast,
    fallbackPrint,
  };
}
