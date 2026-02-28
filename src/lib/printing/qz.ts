/**
 * QZ Tray – Core printing module (v2.2.3 CDN)
 *
 * Uses the global `qz` object loaded via <script> in index.html.
 * Certificate + signature validation via backend functions.
 *
 * RULES:
 * - connect: max 3 retries
 * - listPrinters: 3s hard timeout, fallback to getDefault
 * - NO infinite loops, NO setInterval for printers
 * - All errors surface to caller
 */

declare const qz: any;

export type QZConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
export type PaperWidth = "58mm" | "80mm";

export interface QZDiagnostics {
  lastError: string | null;
  lastPayloadToSign: string | null;
  lastAttemptAt: string | null;
  websocketState: QZConnectionStatus;
}

const LEGACY_PRINTER_KEY = "stockia_printer_name";
const LEGACY_PAPER_WIDTH_KEY = "stockia_paper_width";

export function getPreferredPrinterStorageKey(venueId?: string, posId?: string): string {
  if (venueId && posId) return `preferred_printer:${venueId}:${posId}`;
  return LEGACY_PRINTER_KEY;
}

export function getPreferredPaperWidthStorageKey(venueId?: string, posId?: string): string {
  if (venueId && posId) return `preferred_paper_width:${venueId}:${posId}`;
  return LEGACY_PAPER_WIDTH_KEY;
}

let securityConfigured = false;
let websocketState: QZConnectionStatus = "DISCONNECTED";
let diagnostics: QZDiagnostics = {
  lastError: null,
  lastPayloadToSign: null,
  lastAttemptAt: null,
  websocketState,
};

const COLS_58MM = 32;
const COLS_80MM = 48;
const MAX_CONNECT_RETRIES = 3;
const LIST_PRINTERS_TIMEOUT_MS = 3000;

// ── Helpers ──

function updateDiagnostics(partial: Partial<QZDiagnostics>) {
  diagnostics = { ...diagnostics, ...partial, websocketState };
}

function setWebsocketState(state: QZConnectionStatus) {
  websocketState = state;
  updateDiagnostics({ websocketState: state });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | undefined;
  const tp = new Promise<never>((_, reject) => {
    tid = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, tp]).finally(() => { if (tid) clearTimeout(tid); }) as Promise<T>;
}

function getFunctionUrl(name: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Backend URL no configurada");
  return `${baseUrl}/functions/v1/${name}`;
}

// ── Security ──

function configureSecurity() {
  if (securityConfigured) return;
  if (typeof qz === "undefined") throw new Error("QZ no cargado");

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) throw new Error("Publishable key no configurada");

  qz.security.setHashingAlgorithm?.("SHA256");
  qz.security.setSignatureAlgorithm?.("SHA256");

  qz.security.setCertificatePromise(async () => {
    const res = await fetch(getFunctionUrl("qz-certificate"), {
      method: "POST",
      headers: { apikey: anonKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Certificate HTTP ${res.status}${body ? ` - ${body}` : ""}`);
    }
    return (await res.text()).trim();
  });

  qz.security.setSignaturePromise(async (toSign: string) => {
    updateDiagnostics({
      lastPayloadToSign: toSign,
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
    });

    const res = await fetch(getFunctionUrl("qz-sign"), {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "text/plain" },
      body: toSign,
    });

    const responseText = await res.text();
    if (!res.ok) {
      const msg = `Firma falló (${res.status}): ${responseText}`;
      updateDiagnostics({ lastError: msg });
      throw new Error(msg);
    }

    const signature = responseText.trim();
    if (!signature) {
      const msg = "Firma vacía";
      updateDiagnostics({ lastError: msg });
      throw new Error(msg);
    }
    return signature;
  });

  securityConfigured = true;
}

// ── Connection ──

export function getQZDiagnostics(): QZDiagnostics {
  return { ...diagnostics, websocketState };
}

export function getQZConnectionStatus(): QZConnectionStatus {
  return websocketState;
}

/**
 * Connect to QZ Tray with retry (max 3 attempts).
 * Configures security on first call.
 */
export async function initQZ(): Promise<void> {
  if (typeof qz === "undefined") {
    setWebsocketState("ERROR");
    const msg = "QZ Tray no detectado. Instálalo desde qz.io";
    updateDiagnostics({ lastError: msg, lastAttemptAt: new Date().toISOString() });
    throw new Error(msg);
  }

  configureSecurity();

  if (qz.websocket.isActive()) {
    setWebsocketState("CONNECTED");
    return;
  }

  setWebsocketState("CONNECTING");
  updateDiagnostics({ lastAttemptAt: new Date().toISOString(), lastError: null });

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    try {
      await qz.websocket.connect();
      setWebsocketState("CONNECTED");
      return;
    } catch (error) {
      lastErr = error instanceof Error ? error : new Error(getErrorMessage(error));
      console.warn(`[QZ] Connect attempt ${attempt}/${MAX_CONNECT_RETRIES} failed:`, lastErr.message);
      if (attempt < MAX_CONNECT_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  setWebsocketState("ERROR");
  const msg = lastErr?.message || "No se pudo conectar a QZ Tray";
  updateDiagnostics({ lastError: msg });
  throw new Error(msg);
}

export async function ensureQZConnected(): Promise<void> {
  await initQZ();
}

export async function isQZConnected(): Promise<boolean> {
  try {
    if (typeof qz === "undefined") return false;
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

export async function disconnectQZ(): Promise<void> {
  if (typeof qz !== "undefined" && qz.websocket?.isActive()) {
    await qz.websocket.disconnect();
  }
  setWebsocketState("DISCONNECTED");
}

// ── Printers ──

/**
 * Get default printer (fast, triggers permission popup).
 */
export async function getDefaultPrinter(): Promise<string | null> {
  await ensureQZConnected();
  try {
    const printer = await withTimeout(
      qz.printers.getDefault(),
      LIST_PRINTERS_TIMEOUT_MS,
      "Timeout obteniendo impresora predeterminada",
    );
    return (printer as string) || null;
  } catch {
    return null;
  }
}

/**
 * List all printers. 3s hard timeout. 1 attempt only.
 * If find() fails/timeouts, falls back to getDefault().
 */
export async function listPrinters(timeoutMs = LIST_PRINTERS_TIMEOUT_MS): Promise<string[]> {
  await ensureQZConnected();
  updateDiagnostics({ lastAttemptAt: new Date().toISOString(), lastError: null });

  try {
    const printers = await withTimeout(
      qz.printers.find(),
      timeoutMs,
      `No se pudo listar impresoras (timeout ${timeoutMs / 1000}s)`,
    );
    return Array.isArray(printers) ? printers : [];
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[QZ] find() failed, trying getDefault():", message);

    // Fallback: try getDefault
    try {
      const defaultPrinter = await withTimeout(
        qz.printers.getDefault(),
        LIST_PRINTERS_TIMEOUT_MS,
        "Timeout getDefault",
      );
      if (defaultPrinter) {
        return [defaultPrinter as string];
      }
    } catch (fallbackErr) {
      console.warn("[QZ] getDefault() also failed:", getErrorMessage(fallbackErr));
    }

    updateDiagnostics({ lastError: message });
    throw new Error(message);
  }
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

/**
 * Force handshake: getDefault() then find() to trigger Site Manager permission popup.
 */
export async function forceHandshake(): Promise<{ defaultPrinter: string | null; allPrinters: string[] }> {
  await ensureQZConnected();

  // Step 1: getDefault triggers permission popup
  let defaultPrinter: string | null = null;
  try {
    defaultPrinter = await withTimeout(qz.printers.getDefault(), LIST_PRINTERS_TIMEOUT_MS, "Timeout getDefault");
  } catch (err) {
    console.warn("[QZ] getDefault in handshake:", getErrorMessage(err));
  }

  // Step 2: find() to list all
  let allPrinters: string[] = [];
  try {
    const result = await withTimeout(qz.printers.find(), LIST_PRINTERS_TIMEOUT_MS, "Timeout find");
    allPrinters = Array.isArray(result) ? result : [];
  } catch (err) {
    console.warn("[QZ] find in handshake:", getErrorMessage(err));
    if (defaultPrinter) allPrinters = [defaultPrinter];
  }

  return { defaultPrinter, allPrinters };
}

// ── Printing ──

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

function buildEscPosReceipt(data: ReceiptData, cols: number): string[] {
  const cmds: string[] = [];

  cmds.push("\x1B\x40"); // init
  cmds.push("\x1B\x61\x01"); // center

  cmds.push("\x1B\x21\x30"); // double height+width
  cmds.push(data.venueName + "\n");
  cmds.push("\x1B\x21\x00"); // reset

  cmds.push("=".repeat(cols) + "\n");
  cmds.push(`Venta: ${data.saleNumber}\n`);
  cmds.push(`POS: ${data.posName}\n`);
  cmds.push(`${data.dateTime}\n`);
  cmds.push("=".repeat(cols) + "\n");

  cmds.push("\x1B\x61\x00"); // left
  for (const item of data.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = `$${item.price.toLocaleString("es-CL")}`;
    const padding = Math.max(1, cols - line.length - price.length);
    cmds.push(line + " ".repeat(padding) + price + "\n");
  }

  cmds.push("-".repeat(cols) + "\n");
  cmds.push("\x1B\x61\x02"); // right
  cmds.push("\x1B\x21\x10"); // double width
  cmds.push(`TOTAL: $${data.total.toLocaleString("es-CL")}\n`);
  cmds.push("\x1B\x21\x00"); // reset
  cmds.push("\x1B\x61\x01"); // center

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
  cmds.push("\x1D\x56\x00"); // cut

  return cmds;
}

export async function printRaw(
  printerName: string,
  data: ReceiptData,
  paperWidth: PaperWidth = "80mm",
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

      const qrModuleSize = cols === COLS_58MM ? 4 : 5;
      const token = data.pickupToken;
      const storeLen = token.length + 3;

      printData.push({ type: "raw", format: "command", data: "\x1B\x61\x01" }); // center
      printData.push({ type: "raw", format: "plain", data: "\n" });

      printData.push({
        type: "raw",
        format: "command",
        data:
          "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00" +
          "\x1D\x28\x6B\x03\x00\x31\x43" +
          String.fromCharCode(qrModuleSize) +
          "\x1D\x28\x6B\x03\x00\x31\x45\x31" +
          "\x1D\x28\x6B" +
          String.fromCharCode(storeLen & 0xff) +
          String.fromCharCode((storeLen >> 8) & 0xff) +
          "\x31\x50\x30" +
          token +
          "\x1D\x28\x6B\x03\x00\x31\x51\x30",
      });

      printData.push({ type: "raw", format: "plain", data: "\n\n" });
      if (thanksCmd) printData.push(thanksCmd);
      if (footerCmd) printData.push(footerCmd);
      if (cutCmd) printData.push(cutCmd);
    }

    await qz.print(config, printData);
    setWebsocketState("CONNECTED");
    return { success: true };
  } catch (error) {
    const message = getErrorMessage(error);
    updateDiagnostics({ lastError: message, lastAttemptAt: new Date().toISOString() });
    console.error("[QZ] Print error:", error);
    return { success: false, error: message || "Error de impresión" };
  }
}
