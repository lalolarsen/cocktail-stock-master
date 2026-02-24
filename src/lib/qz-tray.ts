/**
 * QZ Tray – Re-export from canonical module.
 * Kept for backward compatibility with older imports.
 */
export {
  ensureQZConnected as ensureQz,
  ensureQZConnected as connectQz,
  isQZConnected as isQzConnected,
  disconnectQZ as disconnectQz,
  listPrinters as findPrinters,
  findPrinter,
  printRaw as printReceipt,
  type ReceiptData,
} from "@/lib/printing/qz";

// Re-export loadQzTray as no-op for compatibility
export async function loadQzTray(): Promise<boolean> {
  return typeof (globalThis as any).qz !== "undefined";
}
