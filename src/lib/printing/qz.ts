/**
 * QZ Tray – Core printing module (v2.2.3 CDN)
 *
 * Uses the global `qz` object loaded via <script> in index.html.
 * Certificate + signature validation via backend Edge Functions.
 */

// ---------------------------------------------------------------------------
// Global type
// ---------------------------------------------------------------------------

declare const qz: any;

let securityConfigured = false;

// ---------------------------------------------------------------------------
// Security setup
// ---------------------------------------------------------------------------

function configureSecurity() {
  if (securityConfigured) return;
  if (typeof qz === "undefined") throw new Error("QZ Tray no cargado (script faltante)");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  qz.security.setSignatureAlgorithm("SHA256");

  qz.security.setCertificatePromise(() =>
    fetch(`${baseUrl}/functions/v1/qz-certificate`, {
      method: "POST",
      headers: { apikey: anonKey },
    }).then((r) => {
      if (!r.ok) throw new Error(`Certificate HTTP ${r.status}`);
      return r.text();
    }),
  );

  qz.security.setSignaturePromise((toSign: string) =>
    fetch(`${baseUrl}/functions/v1/qz-sign`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "text/plain" },
      body: toSign,
    }).then((r) => {
      if (!r.ok) throw new Error(`Sign HTTP ${r.status}`);
      return r.text();
    }),
  );

  securityConfigured = true;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function ensureQZConnected(): Promise<void> {
  if (typeof qz === "undefined") throw new Error("QZ Tray no cargado. Verifica que qz-tray.js esté en index.html");

  configureSecurity();

  if (qz.websocket.isActive()) return;

  try {
    await qz.websocket.connect();
  } catch (err) {
    console.warn("[QZ] First connect failed, retrying…", err);
    await new Promise((r) => setTimeout(r, 1500));
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }
  }
}

export async function isQZConnected(): Promise<boolean> {
  try {
    await ensureQZConnected();
    return true;
  } catch {
    return false;
  }
}

export async function disconnectQZ(): Promise<void> {
  if (typeof qz !== "undefined" && qz.websocket?.isActive()) {
    await qz.websocket.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Printer discovery
// ---------------------------------------------------------------------------

export async function listPrinters(): Promise<string[]> {
  await ensureQZConnected();
  return qz.printers.find();
}

export async function findPrinter(nameContains: string): Promise<string | null> {
  await ensureQZConnected();
  try {
    const printer = await qz.printers.find(nameContains);
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

  cmds.push("\x1B\x40");       // ESC @ — reset
  cmds.push("\x1B\x61\x01");   // Center align

  cmds.push("\x1B\x21\x30");   // Double height + double width
  cmds.push(data.venueName + "\n");
  cmds.push("\x1B\x21\x00");   // Normal size

  cmds.push("=".repeat(cols) + "\n");
  cmds.push(`Venta: ${data.saleNumber}\n`);
  cmds.push(`POS: ${data.posName}\n`);
  cmds.push(`${data.dateTime}\n`);
  cmds.push("=".repeat(cols) + "\n");

  cmds.push("\x1B\x61\x00");   // Left align
  for (const item of data.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = `$${item.price.toLocaleString("es-CL")}`;
    const padding = Math.max(1, cols - line.length - price.length);
    cmds.push(line + " ".repeat(padding) + price + "\n");
  }

  cmds.push("-".repeat(cols) + "\n");
  cmds.push("\x1B\x61\x02");   // Right align
  cmds.push("\x1B\x21\x10");   // Double height
  cmds.push(`TOTAL: $${data.total.toLocaleString("es-CL")}\n`);
  cmds.push("\x1B\x21\x00");
  cmds.push("\x1B\x61\x01");   // Center

  cmds.push(`Pago: ${data.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}\n`);

  if (data.pickupToken) {
    cmds.push("\n");
    cmds.push("--- CANJE QR ---\n");
    cmds.push(`Token: ${data.pickupToken}\n`);
    cmds.push("\n");
  }

  cmds.push("\n");
  cmds.push("Gracias por tu compra\n");
  cmds.push("\n\n\n");
  cmds.push("\x1D\x56\x00");   // GS V 0 — full cut

  return cmds;
}

// ---------------------------------------------------------------------------
// printRaw – send ESC/POS data directly to thermal printer
// ---------------------------------------------------------------------------

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

    const config = qz.configs.create(printer, { encoding: "UTF-8" });

    const cols =
      paperWidth === "58mm"
        ? COLS_58MM
        : paperWidth === "80mm"
          ? COLS_80MM
          : printerName.toLowerCase().includes("58")
            ? COLS_58MM
            : COLS_80MM;

    const printData: any[] = [];
    const escPosCommands = buildEscPosReceipt(data, cols);
    for (const cmd of escPosCommands) {
      printData.push({ type: "raw", format: "plain", data: cmd });
    }

    if (data.pickupToken) {
      const cutCmd = printData.pop();
      const footerCmd = printData.pop();
      const thanksCmd = printData.pop();

      const qrModuleSize = cols === COLS_58MM ? 4 : 6;
      const token = data.pickupToken;
      const storeLen = token.length + 3;

      printData.push({ type: "raw", format: "command", data: "\x1B\x61\x01" });
      printData.push({ type: "raw", format: "plain", data: "\n" });

      printData.push({
        type: "raw",
        format: "command",
        data:
          "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00" +
          "\x1D\x28\x6B\x03\x00\x31\x43" + String.fromCharCode(qrModuleSize) +
          "\x1D\x28\x6B\x03\x00\x31\x45\x31" +
          "\x1D\x28\x6B" +
          String.fromCharCode(storeLen & 0xff) +
          String.fromCharCode((storeLen >> 8) & 0xff) +
          "\x31\x50\x30" + token +
          "\x1D\x28\x6B\x03\x00\x31\x51\x30",
      });

      printData.push({ type: "raw", format: "plain", data: "\n\n" });
      if (thanksCmd) printData.push(thanksCmd);
      if (footerCmd) printData.push(footerCmd);
      if (cutCmd) printData.push(cutCmd);
    }

    await qz.print(config, printData);
    return { success: true };
  } catch (err: any) {
    console.error("[QZ] Print error:", err);
    return { success: false, error: err?.message || "Error de impresión" };
  }
}
