/**
 * QZ Tray Integration for Silent Thermal Printing
 *
 * Sends ESC/POS commands directly to a thermal printer (e.g. XPrinter)
 * via QZ Tray (https://qz.io/) without opening browser print dialogs.
 *
 * Prerequisites:
 *   1. QZ Tray installed on the kiosk PC
 *   2. QZ Tray running (system tray)
 *   3. Printer name configured in POS settings
 */

// Declare global qz object injected by QZ Tray's websocket connection
declare global {
  interface Window {
    qz?: any;
  }
}

let qzScriptLoaded = false;
let qzScriptLoading = false;

/**
 * Dynamically load the QZ Tray JS library from CDN
 */
export async function loadQzTray(): Promise<boolean> {
  if (window.qz) return true;
  if (qzScriptLoaded) return !!window.qz;

  if (qzScriptLoading) {
    // Wait for ongoing load
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

/**
 * Check if QZ Tray is available and connected
 */
export async function isQzConnected(): Promise<boolean> {
  const loaded = await loadQzTray();
  if (!loaded || !window.qz) return false;

  try {
    if (window.qz.websocket.isActive()) return true;
    await window.qz.websocket.connect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to QZ Tray websocket
 */
export async function connectQz(): Promise<void> {
  const loaded = await loadQzTray();
  if (!loaded || !window.qz) throw new Error("QZ Tray no disponible");

  if (!window.qz.websocket.isActive()) {
    // Skip certificate validation for local use (self-signed)
    window.qz.security.setCertificatePromise(() =>
      Promise.resolve("-----BEGIN CERTIFICATE-----\nMIIFAzCCAuugAwIBAgICEAIwDQYJKoZIhvcNAQEFBQAwgZgxCzAJBgNVBAYTAlVT\n-----END CERTIFICATE-----")
    );
    window.qz.security.setSignatureAlgorithm("SHA512");
    window.qz.security.setSignaturePromise(() => (hash: string) => Promise.resolve(""));

    await window.qz.websocket.connect();
  }
}

/**
 * Find available printers
 */
export async function findPrinters(): Promise<string[]> {
  await connectQz();
  return window.qz.printers.find();
}

/**
 * Find a specific printer by partial name
 */
export async function findPrinter(name: string): Promise<string | null> {
  await connectQz();
  try {
    const printer = await window.qz.printers.find(name);
    return printer || null;
  } catch {
    return null;
  }
}

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

/**
 * Generate ESC/POS commands for a receipt + QR ticket
 */
function buildEscPosReceipt(data: ReceiptData): string[] {
  const cmds: string[] = [];

  // Initialize printer
  cmds.push("\x1B\x40"); // ESC @ — reset
  cmds.push("\x1B\x61\x01"); // Center align

  // Header
  cmds.push("\x1B\x21\x30"); // Double height + double width
  cmds.push(data.venueName + "\n");
  cmds.push("\x1B\x21\x00"); // Normal size

  cmds.push("================================\n");
  cmds.push(`Venta: ${data.saleNumber}\n`);
  cmds.push(`POS: ${data.posName}\n`);
  cmds.push(`${data.dateTime}\n`);
  cmds.push("================================\n");

  // Items — left aligned
  cmds.push("\x1B\x61\x00"); // Left align
  for (const item of data.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = `$${item.price.toLocaleString("es-CL")}`;
    const padding = Math.max(1, 32 - line.length - price.length);
    cmds.push(line + " ".repeat(padding) + price + "\n");
  }

  // Total
  cmds.push("--------------------------------\n");
  cmds.push("\x1B\x61\x02"); // Right align
  cmds.push("\x1B\x21\x10"); // Double height
  cmds.push(`TOTAL: $${data.total.toLocaleString("es-CL")}\n`);
  cmds.push("\x1B\x21\x00"); // Normal
  cmds.push("\x1B\x61\x01"); // Center

  cmds.push(`Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}\n`);

  // QR Code (if pickup token exists)
  if (data.pickupToken) {
    cmds.push("\n");
    cmds.push("--- CANJE QR ---\n");
    // QR Code command (using GS ( k — QZ Tray interprets these)
    // We'll use QZ Tray's built-in QR generation instead
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

/**
 * Print a receipt using QZ Tray
 */
export async function printReceipt(
  printerName: string,
  data: ReceiptData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await connectQz();

    const printer = await findPrinter(printerName);
    if (!printer) {
      return { success: false, error: `Impresora "${printerName}" no encontrada` };
    }

    const config = window.qz.configs.create(printer, {
      encoding: "UTF-8",
    });

    // Build print data — mix of raw ESC/POS and QR image
    const printData: any[] = [];

    // Raw ESC/POS text commands
    const escPosCommands = buildEscPosReceipt(data);
    for (const cmd of escPosCommands) {
      printData.push({ type: "raw", format: "plain", data: cmd });
    }

    // If there's a QR code, use QZ Tray's native QR rendering
    if (data.pickupToken) {
      // Insert QR before the cut command (remove last 2 items: footer + cut)
      const cutCmd = printData.pop(); // cut
      const footerCmd = printData.pop(); // footer newlines
      const thanksCmd = printData.pop(); // thanks text

      // QR code via QZ image rendering (large, centered)
      printData.push({
        type: "raw",
        format: "command",
        data: "\x1B\x61\x01", // center
      });
      printData.push({
        type: "raw",
        format: "plain",
        data: "\n",
      });
      // Use pixel-based QR (ESC/POS native)
      printData.push({
        type: "raw",
        format: "command",
        // QR model 2, error correction M, module size 8
        data:
          "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00" + // Model 2
          "\x1D\x28\x6B\x03\x00\x31\x43\x08" + // Module size 8
          "\x1D\x28\x6B\x03\x00\x31\x45\x31" + // Error correction M
          "\x1D\x28\x6B" +
          String.fromCharCode((data.pickupToken!.length + 3) & 0xff) +
          String.fromCharCode(((data.pickupToken!.length + 3) >> 8) & 0xff) +
          "\x31\x50\x30" +
          data.pickupToken! + // Store QR data
          "\x1D\x28\x6B\x03\x00\x31\x51\x30", // Print QR
      });

      printData.push({
        type: "raw",
        format: "plain",
        data: "\n\n",
      });
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

/**
 * Disconnect from QZ Tray
 */
export async function disconnectQz(): Promise<void> {
  if (window.qz?.websocket?.isActive()) {
    await window.qz.websocket.disconnect();
  }
}
