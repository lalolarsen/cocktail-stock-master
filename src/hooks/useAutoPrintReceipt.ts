/**
 * useAutoPrintReceipt – auto-print a receipt+QR for a sale via QZ Tray.
 *
 * If QZ is not available, exposes `fallbackPrint()` to open browser print dialog.
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isQZConnected,
  printRaw,
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
      const effectivePrinter = printerName || localStorage.getItem("stockia_printer_name") || "";
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
      let result = await printRaw(effectivePrinter, data);

      // Retry once
      if (!result.success) {
        console.warn("[AutoPrint] Attempt 1 failed, retrying…", result.error);
        await new Promise((r) => setTimeout(r, 1000));
        result = await printRaw(effectivePrinter, data);
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
    const result = await printRaw(
      job.printer_name || printerName,
      job.payload as unknown as ReceiptData,
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
  }, [printerName]);

  /**
   * Fallback: open browser print dialog with a minimal receipt.
   * Used when QZ Tray is not available.
   */
  const fallbackPrint = useCallback((data: ReceiptData) => {
    const html = `
      <html>
      <head>
        <title>Recibo ${data.saleNumber}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { font-family: monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 4mm; }
          h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; }
          td:last-child { text-align: right; }
          .total { font-size: 14px; font-weight: bold; text-align: right; }
        </style>
      </head>
      <body>
        <h1>${data.venueName}</h1>
        <div class="center">Venta: ${data.saleNumber}<br/>POS: ${data.posName}<br/>${data.dateTime}</div>
        <div class="line"></div>
        <table>
          ${data.items.map((i) => `<tr><td>${i.quantity}x ${i.name}</td><td>$${i.price.toLocaleString("es-CL")}</td></tr>`).join("")}
        </table>
        <div class="line"></div>
        <div class="total">TOTAL: $${data.total.toLocaleString("es-CL")}</div>
        <div class="center" style="margin-top:4px;">Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}</div>
        ${data.pickupToken ? `<div class="center" style="margin-top:8px;font-weight:bold;">Token: ${data.pickupToken}</div>` : ""}
        <div class="center" style="margin-top:8px;">Gracias por tu compra</div>
      </body>
      </html>
    `;

    const w = window.open("", "_blank", "width=350,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    }
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
