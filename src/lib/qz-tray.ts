/**
 * QZ Tray – Re-export from canonical module.
 * Kept for backward compatibility with older imports.
 */
export {
  initQZ as initQz,
  ensureQZConnected as ensureQz,
  ensureQZConnected as connectQz,
  isQZConnected as isQzConnected,
  disconnectQZ as disconnectQz,
  listPrinters as findPrinters,
  findPrinter,
  getQZDiagnostics,
  getPreferredPrinterStorageKey,
  getPreferredPaperWidthStorageKey,
  printRaw as printReceipt,
  type ReceiptData,
  type PaperWidth,
} from "@/lib/printing/qz";

// Re-export loadQzTray as no-op for compatibility
export async function loadQzTray(): Promise<boolean> {
  return typeof (globalThis as any).qz !== "undefined";
}
