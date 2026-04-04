/**
 * useAutoPrintReceipt – auto-print a receipt via print-js (browser print dialog).
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPreferredPaperWidthStorageKey,
  printRaw,
  printSaleDocuments,
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
  const lastJobIdRef = useRef<string | null>(null);

  /**
   * Auto-print a receipt for a sale.
   * Creates a print_jobs audit row, opens browser print dialog, updates status.
   */
  const autoPrintReceipt = useCallback(
    async (
      data: ReceiptData,
      saleId?: string,
      pickupTokenId?: string,
    ): Promise<PrintResult> => {
      if (!venueId) {
        return { success: false, error: "Venue no configurado" };
      }

      const preferredPaperWidth =
        (localStorage.getItem(getPreferredPaperWidthStorageKey(venueId, posId)) as PaperWidth | null) ||
        "80mm";

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
          printer_name: printerName || "browser",
          payload: data as any,
          attempts: 0,
        })
        .select("id")
        .single();

      const jobId = job?.id;
      if (jobId) lastJobIdRef.current = jobId;

      const result = await printRaw(printerName, data, preferredPaperWidth);

      // Update audit
      if (jobId) {
        await supabase
          .from("print_jobs")
          .update({
            print_status: result.success ? "success" : "failed",
            error_message: result.error || null,
            attempts: 1,
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
        attempts: 2,
        printed_at: result.success ? new Date().toISOString() : null,
      })
      .eq("id", lastJobIdRef.current);

    setIsPrinting(false);
    setLastPrintStatus(result.success ? "success" : "failed");

    return { success: result.success, error: result.error };
  }, [printerName, posId, venueId]);

  return {
    isPrinting,
    lastPrintStatus,
    /** Always true – no external connection needed with print-js */
    qzAvailable: true,
    /** No-op kept for API compatibility */
    checkQzStatus: async () => true,
    autoPrintReceipt,
    reprintLast,
    /** No-op kept for API compatibility */
    fallbackPrint: (_data: ReceiptData) => {
      console.warn("[AutoPrint] fallbackPrint is a no-op with print-js.");
    },
  };
}
