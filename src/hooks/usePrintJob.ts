import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isQzConnected,
  printReceipt,
  type ReceiptData,
} from "@/lib/qz-tray";

interface UsePrintJobOptions {
  venueId: string | undefined;
  posId: string;
  userId: string;
  printerName: string;
  autoPrintEnabled: boolean;
}

interface PrintJobResult {
  success: boolean;
  error?: string;
  jobId?: string;
}

export function usePrintJob({
  venueId,
  posId,
  userId,
  printerName,
  autoPrintEnabled,
}: UsePrintJobOptions) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastPrintStatus, setLastPrintStatus] = useState<"idle" | "success" | "failed">("idle");
  const [qzAvailable, setQzAvailable] = useState<boolean | null>(null);
  const lastJobIdRef = useRef<string | null>(null);

  /**
   * Check QZ Tray connection status
   */
  const checkQzStatus = useCallback(async () => {
    const connected = await isQzConnected();
    setQzAvailable(connected);
    return connected;
  }, []);

  /**
   * Execute a print job with retry logic and DB audit
   */
  const executePrint = useCallback(async (
    data: ReceiptData,
    saleId?: string,
    pickupTokenId?: string,
  ): Promise<PrintJobResult> => {
    if (!venueId || !autoPrintEnabled || !printerName) {
      return { success: false, error: "Impresión automática no configurada" };
    }

    setIsPrinting(true);
    setLastPrintStatus("idle");

    // Create print job record
    const { data: job, error: insertErr } = await supabase
      .from("print_jobs")
      .insert({
        venue_id: venueId,
        pos_id: posId || null,
        sale_id: saleId || null,
        pickup_token_id: pickupTokenId || null,
        user_id: userId,
        job_type: "receipt_qr",
        print_status: "pending",
        printer_name: printerName,
        payload: data as any,
        attempts: 0,
      })
      .select("id")
      .single();

    const jobId = job?.id;
    if (jobId) lastJobIdRef.current = jobId;

    // Attempt 1
    let result = await printReceipt(printerName, data);

    // Retry once if failed
    if (!result.success) {
      console.warn("[Print] Attempt 1 failed, retrying...", result.error);
      await new Promise((r) => setTimeout(r, 1000));
      result = await printReceipt(printerName, data);
    }

    // Update job status
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
  }, [venueId, posId, userId, printerName, autoPrintEnabled]);

  /**
   * Reprint the last job
   */
  const reprintLast = useCallback(async (): Promise<PrintJobResult> => {
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
    const result = await printReceipt(
      job.printer_name || printerName,
      job.payload as unknown as ReceiptData,
    );

    // Log reprint attempt
    await supabase
      .from("print_jobs")
      .update({
        print_status: result.success ? "success" : "failed",
        error_message: result.error || null,
        attempts: 3, // mark as reprint
        printed_at: result.success ? new Date().toISOString() : null,
      })
      .eq("id", lastJobIdRef.current);

    setIsPrinting(false);
    setLastPrintStatus(result.success ? "success" : "failed");

    return { success: result.success, error: result.error };
  }, [printerName]);

  return {
    isPrinting,
    lastPrintStatus,
    qzAvailable,
    checkQzStatus,
    executePrint,
    reprintLast,
  };
}
