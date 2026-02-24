/**
 * QZ Tray Integration for Silent Thermal Printing
 *
 * Sends ESC/POS commands directly to a thermal printer (e.g. XPrinter)
 * via QZ Tray (https://qz.io/) without opening browser print dialogs.
 *
 * Uses certificate + signature validation via backend Edge Function.
 */

import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    qz?: any;
  }
}

let qzScriptLoaded = false;
let qzScriptLoading = false;
let securityConfigured = false;

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

export async function loadQzTray(): Promise<boolean> {
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
// Security: Certificate + Signature via Edge Function
// ---------------------------------------------------------------------------

async function fetchCertificate(): Promise<string> {
  const cached = (window as any).__QZ_CERTIFICATE_CACHE;
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke("qz-certificate", {
    method: "POST",
    body: {},
  });

  // The response is plain text (the PEM certificate)
  if (error) {
    console.error("[QZTray] Certificate fetch failed:", error);
    throw new Error("QZ certificate not available");
  }

  // data could be a string or an object depending on response content-type
  const cert = typeof data === "string" ? data : data?.toString?.() ?? "";
  if (!cert || cert.length < 50) {
    throw new Error("QZ certificate invalid or empty");
  }

  (window as any).__QZ_CERTIFICATE_CACHE = cert;
  return cert;
}

async function signPayload(toSign: string): Promise<string> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qz-sign`;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": anonKey,
      "Content-Type": "text/plain",
    },
    body: toSign,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[QZTray] Signing failed:", errText);
    throw new Error("QZ signature failed");
  }

  return await res.text();
}

function configureSecurity() {
  if (securityConfigured || !window.qz) return;

  window.qz.security.setCertificatePromise(() => fetchCertificate());
  window.qz.security.setSignatureAlgorithm("SHA256");
  window.qz.security.setSignaturePromise((toSign: string) =>
    (async () => await signPayload(toSign))(),
  );

  securityConfigured = true;
}

// ---------------------------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------------------------

/**
 * Ensure QZ Tray is loaded, security is configured, and websocket is active.
 * Retries once on failure.
 */
export async function ensureQz(): Promise<void> {
  const loaded = await loadQzTray();
  if (!loaded || !window.qz) throw new Error("QZ Tray no disponible");

  configureSecurity();

  if (window.qz.websocket.isActive()) return;

  try {
    await window.qz.websocket.connect();
  } catch (err) {
    console.warn("[QZTray] First connect attempt failed, retrying...", err);
    await new Promise((r) => setTimeout(r, 1500));
    if (!window.qz.websocket.isActive()) {
      await window.qz.websocket.connect();
    }
  }
}

/**
 * Check if QZ Tray is available and connected
 */
export async function isQzConnected(): Promise<boolean> {
  try {
    await ensureQz();
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to QZ Tray websocket (alias for ensureQz)
 */
export async function connectQz(): Promise<void> {
  await ensureQz();
}

// ---------------------------------------------------------------------------
// Printer discovery
// ---------------------------------------------------------------------------

export async function findPrinters(): Promise<string[]> {
  await ensureQz();
  return window.qz.printers.find();
}

export async function findPrinter(name: string): Promise<string | null> {
  await ensureQz();
  try {
    const printer = await window.qz.printers.find(name);
    return printer || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Receipt data type
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
// ESC/POS receipt builder (58mm / 80mm thermal)
// ---------------------------------------------------------------------------

const COLS_58MM = 32;
const COLS_80MM = 48;

function buildEscPosReceipt(data: ReceiptData, cols: number = COLS_58MM): string[] {
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
  cmds.push("\x1B\x61\x00"); // Left align
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
  cmds.push("\x1B\x21\x00"); // Normal
  cmds.push("\x1B\x61\x01"); // Center

  cmds.push(`Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}\n`);

  // QR token label (if exists)
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
// Print
// ---------------------------------------------------------------------------

/**
 * Print a receipt using QZ Tray.
 * Supports ESC/POS native QR code rendering for thermal printers.
 */
export async function printReceipt(
  printerName: string,
  data: ReceiptData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureQz();

    const printer = await findPrinter(printerName);
    if (!printer) {
      return { success: false, error: `Impresora "${printerName}" no encontrada` };
    }

    const config = window.qz.configs.create(printer, {
      encoding: "UTF-8",
    });

    // Determine column width based on common thermal widths
    const cols = printerName.toLowerCase().includes("58") ? COLS_58MM : COLS_80MM;

    // Build print data
    const printData: any[] = [];

    const escPosCommands = buildEscPosReceipt(data, cols);
    for (const cmd of escPosCommands) {
      printData.push({ type: "raw", format: "plain", data: cmd });
    }

    // If there's a QR code, use ESC/POS native QR rendering
    if (data.pickupToken) {
      // Remove last items (thanks + newlines + cut) to insert QR before them
      const cutCmd = printData.pop();
      const footerCmd = printData.pop();
      const thanksCmd = printData.pop();

      // QR size: 4 for 58mm, 6 for 80mm (module size in dots)
      const qrModuleSize = cols === COLS_58MM ? 4 : 6;

      // Center align
      printData.push({ type: "raw", format: "command", data: "\x1B\x61\x01" });
      printData.push({ type: "raw", format: "plain", data: "\n" });

      // ESC/POS native QR code commands
      const token = data.pickupToken!;
      const storeLen = token.length + 3;
      printData.push({
        type: "raw",
        format: "command",
        data:
          "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00" + // Model 2
          "\x1D\x28\x6B\x03\x00\x31\x43" + String.fromCharCode(qrModuleSize) + // Module size
          "\x1D\x28\x6B\x03\x00\x31\x45\x31" + // Error correction M
          "\x1D\x28\x6B" +
          String.fromCharCode(storeLen & 0xff) +
          String.fromCharCode((storeLen >> 8) & 0xff) +
          "\x31\x50\x30" +
          token + // Store QR data
          "\x1D\x28\x6B\x03\x00\x31\x51\x30", // Print QR
      });

      printData.push({ type: "raw", format: "plain", data: "\n\n" });
      if (thanksCmd) printData.push(thanksCmd);
      if (footerCmd) printData.push(footerCmd);
      if (cutCmd) printData.push(cutCmd);
    }

    await window.qz.print(config, printData);

    return { success: true };
  } catch (err: any) {
    console.error("[QZTray] Print error:", err);
    return { success: false, error: err?.message || "Error de impresión" };
  }
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export async function disconnectQz(): Promise<void> {
  if (window.qz?.websocket?.isActive()) {
    await window.qz.websocket.disconnect();
  }
}
