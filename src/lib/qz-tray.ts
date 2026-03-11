/**
 * QZ Tray – Legacy compatibility stubs.
 * QZ Tray has been removed. Printing uses print-js (browser native).
 * This file provides no-op stubs so any lingering imports won't break.
 */

export {
  isQZConnected as isQzConnected,
  getPreferredPrinterStorageKey,
  getPreferredPaperWidthStorageKey,
  printRaw as printReceipt,
  type ReceiptData,
  type PaperWidth,
} from "@/lib/printing/qz";

// No-op stubs for removed QZ Tray functions
export async function initQz(): Promise<void> {}
export async function ensureQz(): Promise<void> {}
export async function connectQz(): Promise<void> {}
export async function disconnectQz(): Promise<void> {}
export async function findPrinters(): Promise<string[]> { return []; }
export async function findPrinter(): Promise<string | null> { return null; }
export async function getDefaultPrinter(): Promise<string | null> { return null; }
export async function forceHandshake(): Promise<void> {}
export function invalidatePrinterCache(): void {}
export function getQZDiagnostics(): Record<string, unknown> { return {}; }
export async function loadQzTray(): Promise<boolean> { return false; }
