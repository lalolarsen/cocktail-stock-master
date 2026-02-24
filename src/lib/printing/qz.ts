/**
 * QZ Tray – Core printing module (v2.2.3 CDN)
 *
 * Uses the global `qz` object loaded via <script> in index.html.
 * Certificate + signature validation via backend functions.
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

function updateDiagnostics(partial: Partial<QZDiagnostics>) {
  diagnostics = {
    ...diagnostics,
    ...partial,
    websocketState,
  };
}

function setWebsocketState(state: QZConnectionStatus) {
  websocketState = state;
  updateDiagnostics({ websocketState: state });
}

function getFunctionUrl(name: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Backend URL no configurada");
  return `${baseUrl}/functions/v1/${name}`;
}

function qzError(message: string, cause?: unknown, payload?: string): Error {
  const error = new Error(message);
  (error as any).cause = cause;
  if (payload) (error as any).payload = payload;
  return error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error desconocido";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

function configureSecurity() {
  if (securityConfigured) return;
  if (typeof qz === "undefined") {
    throw new Error("QZ no cargado");
  }

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

    try {
      const res = await fetch(getFunctionUrl("qz-sign"), {
        method: "POST",
        headers: {
          apikey: anonKey,
          "Content-Type": "text/plain",
        },
        body: toSign,
      });

      const responseText = await res.text();

      if (!res.ok) {
        throw qzError(
          `Failed to sign request (${res.status})${responseText ? `: ${responseText}` : ""}`,
          undefined,
          toSign,
        );
      }

      const signature = responseText.trim();
      if (!signature) {
        throw qzError("Failed to sign request: firma vacía", undefined, toSign);
      }

      return signature;
    } catch (error) {
      const message = getErrorMessage(error);
      updateDiagnostics({ lastError: message, lastPayloadToSign: toSign });
      if (error instanceof Error && (error as any).payload) throw error;
      throw qzError(message, error, toSign);
    }
  });

  securityConfigured = true;
}

export function getQZDiagnostics(): QZDiagnostics {
  return { ...diagnostics, websocketState };
}

export async function initQZ(): Promise<void> {
  if (typeof qz === "undefined") {
    setWebsocketState("ERROR");
    const message = "QZ no cargado. Verifica qz-tray.js en index.html";
    updateDiagnostics({ lastError: message, lastAttemptAt: new Date().toISOString() });
    throw new Error(message);
  }

  configureSecurity();

  if (qz.websocket.isActive()) {
    setWebsocketState("CONNECTED");
    return;
  }

  setWebsocketState("CONNECTING");
  updateDiagnostics({ lastAttemptAt: new Date().toISOString(), lastError: null });

  try {
    await qz.websocket.connect();
    setWebsocketState("CONNECTED");
  } catch (error) {
    const message = getErrorMessage(error);
    setWebsocketState("ERROR");
    updateDiagnostics({ lastError: message });
    throw new Error(message);
  }
}

export async function ensureQZConnected(): Promise<void> {
  await initQZ();
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
  setWebsocketState("DISCONNECTED");
}

export async function listPrinters(timeoutMs = 10000): Promise<string[]> {
  await ensureQZConnected();

  updateDiagnostics({ lastAttemptAt: new Date().toISOString(), lastError: null });

  try {
    const printers = await withTimeout(
      qz.printers.find(),
      timeoutMs,
      "No se pudo listar impresoras (timeout 10s)",
    );
    return Array.isArray(printers) ? printers : [];
  } catch (error) {
    const message = getErrorMessage(error);
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

  cmds.push("\x1B\x40");
  cmds.push("\x1B\x61\x01");

  cmds.push("\x1B\x21\x30");
  cmds.push(data.venueName + "\n");
  cmds.push("\x1B\x21\x00");

  cmds.push("=".repeat(cols) + "\n");
  cmds.push(`Venta: ${data.saleNumber}\n`);
  cmds.push(`POS: ${data.posName}\n`);
  cmds.push(`${data.dateTime}\n`);
  cmds.push("=".repeat(cols) + "\n");

  cmds.push("\x1B\x61\x00");
  for (const item of data.items) {
    const line = `${item.quantity}x ${item.name}`;
    const price = `$${item.price.toLocaleString("es-CL")}`;
    const padding = Math.max(1, cols - line.length - price.length);
    cmds.push(line + " ".repeat(padding) + price + "\n");
  }

  cmds.push("-".repeat(cols) + "\n");
  cmds.push("\x1B\x61\x02");
  cmds.push("\x1B\x21\x10");
  cmds.push(`TOTAL: $${data.total.toLocaleString("es-CL")}\n`);
  cmds.push("\x1B\x21\x00");
  cmds.push("\x1B\x61\x01");

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
  cmds.push("\x1D\x56\x00");

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

      printData.push({ type: "raw", format: "command", data: "\x1B\x61\x01" });
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
