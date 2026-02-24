/**
 * QZ Tray – Core printing module
 *
 * Silent thermal printing via QZ Tray (https://qz.io/).
 * Certificate + signature validation via backend Edge Functions.
 */

import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    qz?: any;
  }
}

let qzScriptLoaded = false;
let qzScriptLoading = false;
let securityConfigured = false;

// ---------------------------------------------------------------------------
// Script loader (CDN)
// ---------------------------------------------------------------------------

async function loadQzScript(): Promise<boolean> {
  if (window.qz) return true;
  if (qzScriptLoaded) return !!window.qz;

  if (qzScriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!qzScriptLoading) {
          clearInterval(check);
          resolve(!!window.qz);
        }
      }, 100);
    });
  }

  qzScriptLoading = true;
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qz-tray@2/qz-tray.min.js";
    script.async = true;
    script.onload = () => {
      qzScriptLoaded = true;
      qzScriptLoading = false;
      resolve(!!window.qz);
    };
    script.onerror = () => {
      qzScriptLoading = false;
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Security: Certificate + Signature via Edge Functions
// ---------------------------------------------------------------------------

async function fetchCertificate(): Promise<string> {
  const cached = (window as any).__QZ_CERTIFICATE_CACHE;
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke("qz-certificate", {
    method: "POST",
    body: {},
  });

  if (error) {
    console.error("[QZ] Certificate fetch failed:", error);
    throw new Error("QZ certificate not available");
  }

  const cert = typeof data === "string" ? data : data?.toString?.() ?? "";
  if (!cert || cert.length < 50) {
    throw new Error("QZ certificate invalid or empty");
  }

  (window as any).__QZ_CERTIFICATE_CACHE = cert;
  return cert;
}

/**
 * Sign a request string via the `qz-sign` Edge Function.
 * QZ Tray calls this callback with the string it wants signed.
 */
export async function signRequest(toSign: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("qz-sign", {
    method: "POST",
    body: { payload: toSign },
  });

  if (error || !data?.signature) {
    console.error("[QZ] Signing failed:", error || data);
    throw new Error("QZ signature failed");
  }

  return data.signature;
}

function configureSecurity() {
  if (securityConfigured || !window.qz) return;

  window.qz.security.setCertificatePromise(() => fetchCertificate());
  window.qz.security.setSignatureAlgorithm("SHA512");
  window.qz.security.setSignaturePromise((toSign: string) =>
    (async () => await signRequest(toSign))(),
  );

  securityConfigured = true;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Ensure QZ Tray is loaded, security configured, and websocket active.
 * Retries once on failure.
 */
export async function ensureQZConnected(): Promise<void> {
  const loaded = await loadQzScript();
  if (!loaded || !window.qz) throw new Error("QZ Tray no disponible");

  configureSecurity();

  if (window.qz.websocket.isActive()) return;

  try {
    await window.qz.websocket.connect();
  } catch (err) {
    console.warn("[QZ] First connect attempt failed, retrying…", err);
    await new Promise((r) => setTimeout(r, 1500));
    if (!window.qz.websocket.isActive()) {
      await window.qz.websocket.connect();
    }
  }
}

/**
 * Check if QZ Tray is reachable (non-throwing).
 */
export async function isQZConnected(): Promise<boolean> {
  try {
    await ensureQZConnected();
    return true;
  } catch {
    return false;
  }
}

/**
 * Disconnect from QZ Tray websocket.
 */
export async function disconnectQZ(): Promise<void> {
  if (window.qz?.websocket?.isActive()) {
    await window.qz.websocket.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Printer discovery
// ---------------------------------------------------------------------------

/**
 * List all printers visible to QZ Tray.
 */
export async function listPrinters(): Promise<string[]> {
  await ensureQZConnected();
  return window.qz.printers.find();
}

/**
 * Find a printer whose name contains `nameContains` (case-insensitive).
 * Returns the exact printer name or null.
 */
export async function findPrinter(nameContains: string): Promise<string | null> {
  await ensureQZConnected();
  try {
    const printer = await window.qz.printers.find(nameContains);
    return printer || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Receipt data types
// ---------------------------------------------------------------------------

export interface ReceiptData {
  saleNumber: string;
  venueName: string;
  posName: string;
  dateTime: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  paymentMethod: string;
  pickupToken?: string;
}

// ---------------------------------------------------------------------------
// ESC/POS receipt builder (58 mm / 80 mm thermal)
// ---------------------------------------------------------------------------

const COLS_58MM = 32;
const COLS_80MM = 48;

function buildEscPosReceipt(data: ReceiptData, cols: number): string[] {
  const cmds: string[] = [];

  // Initialize printer
  cmds.push("\x1B\x40"); // ESC @ — reset
  cmds.push("\x1B\x61\x01"); // Center align

  // Header
  cmds.push("\x1B\x21\x30"); // Double height + double width
  cmds.push(data.venueName + "\n");
  cmds.push("\x1B\x21\x00"); // Normal size

  cmds.push("=".repeat(cols) + "\n");
  cmds.push(`Venta: ${data.saleNumber}\n`);
  cmds.push(`POS: ${data.posName}\n`);
  cmds.push(`${data.dateTime}\n`);
  cmds.push("=".repeat(cols) + "\n");

  // Items — left aligned
  cmds.push("\x1B\x61\x00");
  for (const item of data.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = `$${item.price.toLocaleString("es-CL")}`;
    const padding = Math.max(1, cols - line.length - price.length);
    cmds.push(line + " ".repeat(padding) + price + "\n");
  }

  // Total
  cmds.push("-".repeat(cols) + "\n");
  cmds.push("\x1B\x61\x02"); // Right align
  cmds.push("\x1B\x21\x10"); // Double height
  cmds.push(`TOTAL: $${data.total.toLocaleString("es-CL")}\n`);
  cmds.push("\x1B\x21\x00");
  cmds.push("\x1B\x61\x01"); // Center

  cmds.push(`Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}\n`);

  // QR token label
  if (data.pickupToken) {
    cmds.push("\n");
    cmds.push("--- CANJE QR ---\n");
    cmds.push(`Token: ${data.pickupToken}\n`);
    cmds.push("\n");
  }

  // Footer
  cmds.push("\n");
  cmds.push("Gracias por tu compra\n");
  cmds.push("\n\n\n");

  // Cut paper
  cmds.push("\x1D\x56\x00"); // GS V 0 — full cut

  return cmds;
}

// ---------------------------------------------------------------------------
// printRaw – send ESC/POS data directly to thermal printer
// ---------------------------------------------------------------------------

/**
 * Print raw ESC/POS receipt data on a thermal printer.
 * Supports native QR code rendering for pickup tokens.
 *
 * @param printerName  Exact printer name (from findPrinter / listPrinters)
 * @param data         Receipt payload
 * @param paperWidth   "58mm" | "80mm" — defaults to auto-detect from printer name
 */
export async function printRaw(
  printerName: string,
  data: ReceiptData,
  paperWidth?: "58mm" | "80mm",
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureQZConnected();

    const printer = await findPrinter(printerName);
    if (!printer) {
      return { success: false, error: `Impresora "${printerName}" no encontrada` };
    }

    const config = window.qz.configs.create(printer, { encoding: "UTF-8" });

    // Determine column width
    const cols =
      paperWidth === "58mm"
        ? COLS_58MM
        : paperWidth === "80mm"
          ? COLS_80MM
          : printerName.toLowerCase().includes("58")
            ? COLS_58MM
            : COLS_80MM;

    // Build print data
    const printData: any[] = [];
    const escPosCommands = buildEscPosReceipt(data, cols);
    for (const cmd of escPosCommands) {
      printData.push({ type: "raw", format: "plain", data: cmd });
    }

    // Native ESC/POS QR code
    if (data.pickupToken) {
      // Pop footer + cut to insert QR before them
      const cutCmd = printData.pop();
      const footerCmd = printData.pop();
      const thanksCmd = printData.pop();

      const qrModuleSize = cols === COLS_58MM ? 4 : 6;
      const token = data.pickupToken;
      const storeLen = token.length + 3;

      // Center align
      printData.push({ type: "raw", format: "command", data: "\x1B\x61\x01" });
      printData.push({ type: "raw", format: "plain", data: "\n" });

      // ESC/POS QR commands
      printData.push({
        type: "raw",
        format: "command",
        data:
          "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00" +               // Model 2
          "\x1D\x28\x6B\x03\x00\x31\x43" + String.fromCharCode(qrModuleSize) + // Module size
          "\x1D\x28\x6B\x03\x00\x31\x45\x31" +                    // Error correction M
          "\x1D\x28\x6B" +
          String.fromCharCode(storeLen & 0xff) +
          String.fromCharCode((storeLen >> 8) & 0xff) +
          "\x31\x50\x30" + token +                                 // Store QR data
          "\x1D\x28\x6B\x03\x00\x31\x51\x30",                     // Print QR
      });

      printData.push({ type: "raw", format: "plain", data: "\n\n" });
      if (thanksCmd) printData.push(thanksCmd);
      if (footerCmd) printData.push(footerCmd);
      if (cutCmd) printData.push(cutCmd);
    }

    await window.qz.print(config, printData);
    return { success: true };
  } catch (err: any) {
    console.error("[QZ] Print error:", err);
    return { success: false, error: err?.message || "Error de impresión" };
  }
}
